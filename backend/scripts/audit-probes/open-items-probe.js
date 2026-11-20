'use strict';

// Open-items decisions probe (BK-03, BK-04, BK-05, FL-05, FL-06, FL-14, F-09, RV-40), steps added one at a time.
// Run against the dev server + the disposable TEST database:  node scripts/audit-probes/open-items-probe.js [step ...]
// e.g. `node scripts/audit-probes/open-items-probe.js 1 2` runs only steps 1 and 2. Prints only, writes no file.
// Every fixture it creates is removed again (see each step's finally).
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5000/api/v1';
const PASS = 'Demo@123456';
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`); };
const note = (m) => console.log(`  info  ${m}`);
const section = (t) => console.log(`\n${t}`);
const idOf = (x) => String(x?._id || x || '');

class Client {
  async login(email, password) {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (r.status !== 200) return null;
    this.token = (r.headers.getSetCookie().find((c) => c.startsWith('token=')) || '').split(';')[0].slice(6);
    this.csrf = r.headers.get('x-csrf-token');
    return this;
  }
  async req(method, url, body) {
    const headers = { Cookie: `token=${this.token}` };
    if (method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${BASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await r.json(); } catch { /* not json */ }
    return { status: r.status, body: json, data: json?.data, message: json?.message, code: json?.code };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b ?? {}); }
  put(u, b) { return this.req('PUT', u, b ?? {}); }
  del(u) { return this.req('DELETE', u); }
  async all(path) {
    const out = []; const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; ; page += 1) {
      const r = await this.get(`${path}${sep}limit=100&page=${page}`);
      out.push(...(r.data || []));
      if (page >= (r.body?.pagination?.totalPages || 1)) return out;
    }
  }
}

const steps = {};

// ── Step 1: BK-03 the booking report shows the booking's OWN POL/POD ──────────
steps[1] = async ({ admin }) => {
  section('Step 1 (BK-03): booking report shows the booking\'s own POL/POD, not the voyage ports');
  const l2 = await admin.all('/bookings');
  const l1 = await admin.all('/bookings/manual');
  const rep = await admin.get('/reports/bookings?limit=500&status=');
  const rows = rep.data?.rows || rep.data?.data || rep.data || [];
  check('report returns rows', rep.status === 200 && rows.length > 0, `${rep.status} ${rep.message}`);
  const own = new Map([...l2, ...l1].map((b) => [String(b._id), b]));
  let compared = 0; let bad = 0; let intermediate = 0;
  for (const r of rows) {
    const b = own.get(String(r._id));
    if (!b) continue;
    compared += 1;
    const wantPol = b.polId?.name || ''; const wantPod = b.podId?.name || '';
    if (r.polName !== wantPol || r.podName !== wantPod) bad += 1;
    const v = b.voyageId;
    if (v?.polId && idOf(v.polId) !== idOf(b.polId)) intermediate += 1;
  }
  check(`every compared row (${compared}) carries the booking's own POL and POD`, compared > 0 && bad === 0, `${bad} wrong`);
  note(`${intermediate} of them start somewhere other than the voyage's first port (intermediate-port bookings)`);
};

// ── Step 2: BK-04 leg edit warns about live bookings with stale leg keys ───────
steps[2] = async ({ admin, db }) => {
  section('Step 2 (BK-04): editing round legs warns about live bookings whose leg key no longer fits (warn, never block)');
  const rounds = await admin.all('/rounds');
  let pick = null;
  for (const r of rounds) {
    if (!['Planned', 'Active'].includes(r.status) || r.closeStatus === 'Closed') continue;
    const vs = await admin.all(`/voyages?roundId=${r._id}`);
    for (const v of vs.filter((x) => x.status !== 'Cancelled')) {
      const l2 = (await admin.get(`/bookings?voyageId=${v._id}&limit=100`)).data || [];
      const keyed = l2.filter((b) => b.status !== 'Cancelled' && b.polLegKey);
      if (keyed.length) { pick = { round: r, voyage: v, keyed }; break; }
    }
    if (pick) break;
  }
  if (!pick) { note('SKIP: no open round with a live keyed booking in this DB'); return; }
  const rid = pick.round._id;
  const doc = await db.collection('rounds').findOne({ _id: new mongoose.Types.ObjectId(rid) });
  const original = doc.routeSnapshot;
  const legs = original.legs;
  const asBody = (ls) => ls.map((l) => ({ legKey: l.legKey, countryId: String(l.countryId), cityId: String(l.cityId), portId: String(l.portId), terminalId: l.terminalId ? String(l.terminalId) : null, agentId: l.agentId ? String(l.agentId) : null }));
  const bookingKeys = new Set(pick.keyed.flatMap((b) => [b.polLegKey, b.podLegKey].filter(Boolean)));
  try {
    const same = await admin.put(`/rounds/${rid}/legs`, { legs: asBody(legs) });
    check('saving the same legs: 200 and no stale-booking warning', same.status === 200 && !(same.data?.warnings || []).some((w) => /live booking/.test(w)), `${same.status} ${JSON.stringify(same.data?.warnings)}`);
    // drop a leg that a live booking uses (keep at least 2 legs)
    const dropKey = [...bookingKeys].find((k) => legs.length > 2 && legs.some((l) => l.legKey === k));
    if (!dropKey) { note('SKIP removal test: the keyed bookings use no droppable leg'); return; }
    const edited = legs.filter((l) => l.legKey !== dropKey);
    const r = await admin.put(`/rounds/${rid}/legs`, { legs: asBody(edited) });
    check('removing a leg that live bookings use: still 200 (never blocked)', r.status === 200, `${r.status} ${r.message}`);
    check(`the response warns about live bookings on voyage ${pick.voyage.voyageNumber}`, (r.data?.warnings || []).some((w) => /live booking/.test(w) && w.includes(pick.voyage.voyageNumber)), JSON.stringify(r.data?.warnings));
    const after = (await admin.get(`/bookings?voyageId=${pick.voyage._id}&limit=100`)).data || [];
    check('no booking was changed by the leg edit', after.length === ((await admin.all(`/bookings?voyageId=${pick.voyage._id}`)).length) && pick.keyed.every((b) => after.find((a) => a._id === b._id)?.polLegKey === b.polLegKey));
  } finally {
    await db.collection('rounds').updateOne({ _id: new mongoose.Types.ObjectId(rid) }, { $set: { routeSnapshot: original } }); // put the original legs back
    const back = await admin.get(`/rounds/${rid}`);
    check('original legs restored (fixture cleanup)', (back.data?.routeSnapshot?.legs || []).length === legs.length);
  }
};

// ── Step 3: BK-05 move a Pending/Confirmed booking to another voyage of the same round ──
steps[3] = async ({ admin, db, Client, PASS }) => {
  section('Step 3 (BK-05): POST /bookings/:id/move and /bookings/manual/:id/move');
  const voyages = await admin.all('/voyages');
  let bookable = null;
  for (const v of voyages) { const a = (await admin.get(`/voyages/${v._id}/summary`)).data; if (a?.actions?.canBook && ['Planned', 'Active'].includes(a.voyage.roundStatus)) { bookable = v; break; } }
  if (!bookable) { note('SKIP: no bookable voyage'); return; }
  const bd = (await admin.get(`/voyages/${bookable._id}`)).data;
  const rid = String(bd.round._id);
  const lk = (await admin.get(`/bookings/lookups?roundId=${rid}`)).data;
  const ct = (lk.containerTypes || []).find((c) => c.size === '20ft') || lk.containerTypes?.[0];
  const agent = lk.agents?.[0];
  const first = bd.portCalls[0]; const last = bd.portCalls[bd.portCalls.length - 1];
  const route = { roundId: rid, agentId: agent._id, polId: String(first.portId), podId: String(last.portId), polLegKey: first.legKey, podLegKey: last.legKey };
  const mk = []; const tmp = [];
  const box = () => `ZZMV${String(Date.now() % 1e7).padStart(7, '0')}`;
  try {
    const twinRes = await admin.post('/voyages', { roundId: rid, direction: bd.direction, fromLegKey: bd.fromLegKey, toLegKey: bd.toLegKey, voyageName: 'ZV-MOVE probe twin' });
    if (twinRes.status !== 201) { note(`SKIP: twin voyage not created (${twinRes.status} ${twinRes.message})`); return; }
    const twin = twinRes.data; tmp.push(twin._id);
    const l1 = await admin.post('/bookings/manual', { ...route, voyageId: String(bookable._id), cargoRows: [{ containerTypeId: ct._id, quantity: 2 }] });
    const l2 = await admin.post('/bookings', { ...route, voyageId: String(bookable._id), containerTypeId: ct._id, freightRate: 0, containerNumber: box() });
    if (l1.status === 201) mk.push(['/bookings/manual/', l1.data._id]);
    if (l2.status === 201) mk.push(['/bookings/', l2.data._id]);
    check('fixtures: one Layer 1 and one Layer 2 booking on the original voyage', l1.status === 201 && l2.status === 201, `${l1.status} ${l1.message} / ${l2.status} ${l2.message}`);
    if (l1.status !== 201 || l2.status !== 201) return;
    const vid = (b) => String(b?.voyageId?._id || b?.voyageId);
    const capBefore = ((await admin.get(`/capacity/round/${rid}`)).data?.voyages || []);
    const row = (cap, v) => cap.find((x) => String(x.voyageId) === String(v._id));

    // Layer 1: Pending -> move to the twin
    const m1 = await admin.put(`/bookings/manual/${l1.data._id}/move`, { voyageId: String(twin._id) });
    check('Layer 1 Pending booking moves to the twin voyage (200)', m1.status === 200 && vid(m1.data) === String(twin._id), `${m1.status} ${m1.message}`);
    check('ports and status are unchanged by the move', String(m1.data?.polId?._id) === String(first.portId) && String(m1.data?.podId?._id) === String(last.portId) && m1.data?.status === 'Pending');
    const capAfter = ((await admin.get(`/capacity/round/${rid}`)).data?.voyages || []);
    const t0 = row(capBefore, twin)?.layer1?.loadedTEU || 0; const t1 = row(capAfter, twin)?.layer1?.loadedTEU || 0;
    const o0 = row(capBefore, bookable)?.layer1?.loadedTEU || 0; const o1 = row(capAfter, bookable)?.layer1?.loadedTEU || 0;
    check('capacity followed the booking (cache cleared): twin gained its TEU, the original lost it', t1 > t0 && o1 < o0 && t1 - t0 === o0 - o1, `twin ${t0}->${t1}, original ${o0}->${o1}`);
    await new Promise((r) => setTimeout(r, 800));
    const { ObjectId } = require('mongoose').Types;
    const audit = await db.collection('auditlogs').find({ recordId: new ObjectId(l1.data._id), action: 'UPDATE' }).sort({ timestamp: -1 }).limit(1).toArray();
    check('an audit entry (UPDATE with old and new values) was written for the move', audit.length === 1 && !!audit[0].oldValues && !!audit[0].newValues, JSON.stringify(audit[0] && Object.keys(audit[0])));
    check('the twin summary counts the moved booking', ((await admin.get(`/voyages/${twin._id}/summary`)).data?.bookings?.estimated?.total || 0) >= 1);

    // Layer 2: Confirmed -> twin, then back
    const c2 = await admin.put(`/bookings/${l2.data._id}`, { status: 'Confirmed' });
    check('fixture: Layer 2 booking Confirmed', c2.status === 200, `${c2.status} ${c2.message}`);
    const m2 = await admin.put(`/bookings/${l2.data._id}/move`, { voyageId: String(twin._id) });
    check('Layer 2 Confirmed booking moves to the twin (200)', m2.status === 200 && vid(m2.data) === String(twin._id), `${m2.status} ${m2.message}`);
    const back = await admin.put(`/bookings/${l2.data._id}/move`, { voyageId: String(bookable._id) });
    check('and back to the original voyage (200)', back.status === 200 && vid(back.data) === String(bookable._id), `${back.status} ${back.message}`);

    // refusals
    check('same voyage -> 400', (await admin.put(`/bookings/${l2.data._id}/move`, { voyageId: String(bookable._id) })).status === 400);
    check('missing or bad target -> 400', (await admin.put(`/bookings/${l2.data._id}/move`, {})).status === 400 && (await admin.put(`/bookings/${l2.data._id}/move`, { voyageId: 'nope' })).status === 400);
    check('unknown target voyage -> 404', (await admin.put(`/bookings/${l2.data._id}/move`, { voyageId: '000000000000000000000000' })).status === 404);
    const other = voyages.find((v) => String(v.roundId?._id || v.roundId) !== rid && v.status !== 'Cancelled');
    if (other) check('a voyage of ANOTHER round -> 400', (await admin.put(`/bookings/${l2.data._id}/move`, { voyageId: String(other._id) })).status === 400);
    const wrongDir = voyages.find((v) => String(v.roundId?._id || v.roundId) === rid && v.direction && v.direction !== bd.direction && v.status === 'Scheduled');
    if (wrongDir) { const r = await admin.put(`/bookings/${l2.data._id}/move`, { voyageId: String(wrongDir._id) }); check('a voyage that does not run POL -> POD in that direction -> 400', r.status === 400, `${r.status} ${r.message}`); }
    else note('no opposite-direction voyage in this round: that refusal is covered by the voyageMatch unit tests');
    const fl = await admin.put(`/bookings/manual/${l1.data._id}`, { status: 'Final Loading' });
    if (fl.status === 200) { const r = await admin.put(`/bookings/manual/${l1.data._id}/move`, { voyageId: String(bookable._id) }); check('a Final Loading booking cannot be moved -> 400', r.status === 400 && /Pending or Confirmed/.test(r.message), `${r.status} ${r.message}`); }
    else note(`could not set Final Loading on the fixture (${fl.status})`);
    const partner = await new Client().login('partner@logistics.com', PASS);
    if (partner) check('a partner user cannot move bookings (403 or 404)', [403, 404].includes((await partner.put(`/bookings/${l2.data._id}/move`, { voyageId: String(twin._id) })).status));
  } finally {
    for (const [p, id] of mk) await admin.del(`${p}${id}`);
    for (const id of tmp) await admin.del(`/voyages/${id}`);
    const left = await db.collection('voyages').countDocuments({ voyageName: /ZV-MOVE/ });
    check('fixtures removed (no ZV-MOVE voyage left)', left === 0, String(left));
  }
};

// ── Step 4: FL-05 Final Loading -> Cancelled through the API (refused when on a live invoice) ──
steps[4] = async ({ admin, db }) => {
  section('Step 4 (FL-05): a Final Loading booking can be cancelled (status only); invoiced ones cannot');
  const { ObjectId } = require('mongoose').Types;
  const voyages = await admin.all('/voyages');
  let bookable = null;
  for (const v of voyages) { const a = (await admin.get(`/voyages/${v._id}/summary`)).data; if (a?.actions?.canBook && ['Planned', 'Active'].includes(a.voyage.roundStatus)) { bookable = v; break; } }
  if (!bookable) { note('SKIP: no bookable voyage'); return; }
  const bd = (await admin.get(`/voyages/${bookable._id}`)).data;
  const rid = String(bd.round._id);
  const lk = (await admin.get(`/bookings/lookups?roundId=${rid}`)).data;
  const ct = (lk.containerTypes || []).find((c) => c.size === '20ft') || lk.containerTypes?.[0];
  const agent = lk.agents?.[0];
  const first = bd.portCalls[0]; const last = bd.portCalls[bd.portCalls.length - 1];
  const route = { roundId: rid, agentId: agent._id, polId: String(first.portId), podId: String(last.portId), polLegKey: first.legKey, podLegKey: last.legKey, voyageId: String(bookable._id) };
  const mk = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const teuNow = async () => ((await admin.get(`/capacity/round/${rid}`)).data?.voyages || []).find((x) => String(x.voyageId) === String(bookable._id));
  try {
    // Layer 2
    const l2 = await admin.post('/bookings', { ...route, containerTypeId: ct._id, freightRate: 0, containerNumber: `ZZFL${String(Date.now() % 1e7).padStart(7, '0')}` });
    if (l2.status !== 201) { check('fixture Layer 2 booking', false, `${l2.status} ${l2.message}`); return; }
    mk.push(['/bookings/', l2.data._id]);
    const toFL = await admin.put(`/bookings/${l2.data._id}`, { status: 'Final Loading' });
    check('fixture: Layer 2 booking is Final Loading', toFL.status === 200 && toFL.data?.status === 'Final Loading', `${toFL.status} ${toFL.message}`);
    const before = (await teuNow())?.layer2?.loadedTEU || 0;
    check('a Final Loading booking still cannot be EDITED (400)', (await admin.put(`/bookings/${l2.data._id}`, { shipper: 'changed' })).status === 400);
    check('cancel + another field together is refused (400): status-only', (await admin.put(`/bookings/${l2.data._id}`, { status: 'Cancelled', shipper: 'x' })).status === 400);
    check('Final Loading -> Confirmed is still refused (400)', (await admin.put(`/bookings/${l2.data._id}`, { status: 'Confirmed' })).status === 400);

    // invoiced: lock the derived BookingItem that contains it (fixture), expect 409 BOOKING_INVOICED
    await sleep(1500); // the item sync runs after the save
    const item = await db.collection('bookingitems').findOne({ bookingIds: new ObjectId(l2.data._id) });
    if (!item) note('no derived BookingItem found (sync not finished?): invoiced refusal not probed');
    else {
      await db.collection('bookingitems').updateOne({ _id: item._id }, { $set: { locked: true } });
      const r = await admin.put(`/bookings/${l2.data._id}`, { status: 'Cancelled' });
      check('on a live invoice (locked item): refused 409 (live invoice message)', r.status === 409 && /live invoice/.test(r.message), `${r.status} ${r.code} ${r.message}`);
      check('and the booking is still Final Loading', (await admin.get(`/bookings/${l2.data._id}`)).data?.status === 'Final Loading');
      await db.collection('bookingitems').updateOne({ _id: item._id }, { $set: { locked: false } });
    }
    const c = await admin.put(`/bookings/${l2.data._id}`, { status: 'Cancelled' });
    check('not invoiced: Final Loading -> Cancelled works (200)', c.status === 200 && c.data?.status === 'Cancelled', `${c.status} ${c.message}`);
    const after = (await teuNow())?.layer2?.loadedTEU || 0;
    check('capacity released the container (cache cleared)', after < before, `${before} -> ${after}`);
    check('a Cancelled booking cannot be edited or cancelled again (400)', (await admin.put(`/bookings/${l2.data._id}`, { status: 'Cancelled' })).status === 400);
    await sleep(1200);
    const gone = await db.collection('bookingitems').findOne({ bookingIds: new ObjectId(l2.data._id) });
    check('the derived invoice item no longer contains the cancelled booking', !gone, JSON.stringify(gone && gone._id));

    // Layer 1
    const l1 = await admin.post('/bookings/manual', { ...route, cargoRows: [{ containerTypeId: ct._id, quantity: 1 }] });
    if (l1.status === 201) {
      mk.push(['/bookings/manual/', l1.data._id]);
      await admin.put(`/bookings/manual/${l1.data._id}`, { status: 'Final Loading' });
      check('Layer 1 Final Loading: an edit is refused (400)', (await admin.put(`/bookings/manual/${l1.data._id}`, { remarks: 'x' })).status === 400);
      const c1 = await admin.put(`/bookings/manual/${l1.data._id}`, { status: 'Cancelled' });
      check('Layer 1 Final Loading -> Cancelled works (200)', c1.status === 200 && c1.data?.status === 'Cancelled', `${c1.status} ${c1.message}`);
    }
  } finally {
    for (const [p, id] of mk) await admin.del(`${p}${id}`);
    await sleep(1200);
    await db.collection('bookingitems').deleteMany({ bookingIds: { $in: mk.map(([, id]) => new ObjectId(id)) }, locked: false });
  }
};

// shared helper for steps 5 and 6: a temporary round (and optionally a voyage) built through the API, removed afterwards
const roundFixture = async ({ admin }, { vesselId, status = 'Planned', withVoyage = false }) => {
  const rounds = await admin.all('/rounds');
  const model = rounds.find((r) => r.serviceId && ['Active', 'Planned'].includes(r.status) && r.status !== 'Cancelled') || rounds[0];
  const day = 86400000;
  const res = await admin.post('/rounds', {
    serviceId: idOf(model.serviceId), vesselId, roundName: 'ZR-OPEN probe',
    startDate: new Date(Date.now() + 2 * day).toISOString(), endDate: new Date(Date.now() + 40 * day).toISOString(), status,
  });
  const round = res.data?.round; // POST /rounds answers { round, voyages }
  const out = { res, round, voyage: null };
  if (res.status === 201 && withVoyage) {
    const legs = round.routeSnapshot?.legs || [];
    const v = await admin.post('/voyages', { roundId: round._id, direction: 'East', fromLegKey: legs[0].legKey, toLegKey: legs[legs.length - 1].legKey, voyageName: 'ZV-OPEN probe' });
    out.voyageRes = v; out.voyage = v.data; out.legs = legs;
  }
  return out;
};
const dropRound = async ({ admin }, fx) => {
  if (fx?.round?._id) {
    await admin.put(`/rounds/${fx.round._id}`, { status: 'Cancelled' }); // may be refused; the delete below is the real cleanup
    await admin.del(`/rounds/${fx.round._id}`);
  }
};
const freeVessel = async ({ admin }) => {
  const [vessels, rounds] = await Promise.all([admin.all('/vessels'), admin.all('/rounds')]);
  const busy = new Set(rounds.filter((r) => r.status === 'Active').map((r) => idOf(r.vesselId)));
  return { free: vessels.find((v) => v.status === 'Active' && !busy.has(String(v._id))), busyVesselId: [...busy][0], activeRound: rounds.find((r) => r.status === 'Active') };
};

// ── Step 5: FL-06 a round cannot be Completed while Pending/Confirmed bookings exist ──
steps[5] = async (ctx) => {
  const { admin } = ctx;
  section('Step 5 (FL-06): Completed is refused while Pending or Confirmed bookings exist (Final Loading / Cancelled do not count)');
  const { free } = await freeVessel(ctx);
  if (!free) { note('SKIP: no Active vessel without an Active round to build a fixture round on'); return; }
  const fx = await roundFixture(ctx, { vesselId: free._id, withVoyage: true });
  const bk = [];
  try {
    if (fx.res.status !== 201 || !fx.voyage) { check('fixture round + voyage created', false, `${fx.res.status} ${fx.res.message} / ${fx.voyageRes?.status} ${fx.voyageRes?.message}`); return; }
    const rid = fx.round._id;
    const lk = (await admin.get(`/bookings/lookups?roundId=${rid}`)).data;
    const ct = lk.containerTypes?.[0]; const agent = lk.agents?.[0];
    const first = fx.legs[0]; const last = fx.legs[fx.legs.length - 1];
    const body = { roundId: rid, agentId: agent._id, polId: String(first.portId), podId: String(last.portId), polLegKey: first.legKey, podLegKey: last.legKey, voyageId: String(fx.voyage._id) };
    const b = await admin.post('/bookings/manual', { ...body, cargoRows: [{ containerTypeId: ct._id, quantity: 1 }] });
    check('fixture: a Pending estimated booking on the fixture round', b.status === 201, `${b.status} ${b.message}`);
    if (b.status !== 201) return;
    bk.push(b.data._id);
    const act = await admin.put(`/rounds/${rid}`, { status: 'Active' });
    check('fixture: round Active', act.status === 200, `${act.status} ${act.message}`);
    const r1 = await admin.put(`/rounds/${rid}`, { status: 'Completed' });
    check('Pending booking present: Completed refused (409, message with counts)', r1.status === 409 && /Pending or Confirmed/.test(r1.message) && /1 estimated/.test(r1.message), `${r1.status} ${r1.message}`);
    await admin.put(`/bookings/manual/${bk[0]}`, { status: 'Confirmed' });
    check('Confirmed booking present: still refused', (await admin.put(`/rounds/${rid}`, { status: 'Completed' })).status === 409);
    await admin.put(`/bookings/manual/${bk[0]}`, { status: 'Final Loading' });
    // an operational booking too
    const l2 = await admin.post('/bookings', { ...body, containerTypeId: ct._id, freightRate: 0, containerNumber: `ZZOP${String(Date.now() % 1e7).padStart(7, '0')}` });
    if (l2.status === 201) {
      bk.push(`L2:${l2.data._id}`);
      const r2 = await admin.put(`/rounds/${rid}`, { status: 'Completed' });
      check('a Pending Layer 2 booking also refuses Completed (409)', r2.status === 409 && /1 booking\(s\)/.test(r2.message), `${r2.status} ${r2.message}`);
      await admin.put(`/bookings/${l2.data._id}`, { status: 'Cancelled' });
    }
    const ok = await admin.put(`/rounds/${rid}`, { status: 'Completed' });
    check('only Final Loading and Cancelled bookings left: Completed is allowed (200)', ok.status === 200 && ok.data?.status === 'Completed', `${ok.status} ${ok.message}`);
  } finally {
    for (const id of bk) { if (id.startsWith('L2:')) await admin.del(`/bookings/${id.slice(3)}`); else await admin.del(`/bookings/manual/${id}`); }
    await dropRound(ctx, fx);
    const left = await ctx.db.collection('rounds').countDocuments({ roundName: 'ZR-OPEN probe' });
    check('fixture round removed', left === 0, `${left} left`);
  }
};

// ── Step 6: FL-14 one Active round per vessel is enforced at ACTIVATION, not at Planned creation ──
steps[6] = async (ctx) => {
  const { admin } = ctx;
  section('Step 6 (FL-14): a Planned round may be created beside an Active one; two Active rounds on a vessel are still refused');
  const { busyVesselId, activeRound } = await freeVessel(ctx);
  if (!busyVesselId) { note('SKIP: no vessel with an Active round in this DB'); return; }
  const planned = await roundFixture(ctx, { vesselId: busyVesselId, status: 'Planned' });
  const asActive = await roundFixture(ctx, { vesselId: busyVesselId, status: 'Active' });
  try {
    check(`Planned round on a vessel that has an Active round (${activeRound.roundNumber}) -> 201`, planned.res.status === 201, `${planned.res.status} ${planned.res.message}`);
    check('creating a round directly as Active on that vessel -> 409 VESSEL_HAS_ACTIVE_ROUND', asActive.res.status === 409, `${asActive.res.status} ${asActive.res.message}`);
    if (planned.res.status === 201) {
      const act = await admin.put(`/rounds/${planned.round._id}`, { status: 'Active' });
      check('activating that Planned round while the other is Active -> 409', act.status === 409 && /already assigned to active round/.test(act.message), `${act.status} ${act.message}`);
      const still = (await admin.get(`/rounds/${planned.round._id}`)).data;
      check('and it stays Planned', still?.status === 'Planned');
      const edit = await admin.put(`/rounds/${planned.round._id}`, { notes: 'edit a Planned round beside an Active one' });
      check('editing a Planned round (notes) beside an Active one still works', edit.status === 200, `${edit.status} ${edit.message}`);
    }
    // the database index is still the last guard
    const idx = (await ctx.db.collection('rounds').indexes()).find((i) => i.name === 'one_active_round_per_vessel');
    check('the partial unique index one_active_round_per_vessel is still in place', !!idx && !!idx.unique);
  } finally {
    await dropRound(ctx, planned); await dropRound(ctx, asActive);
    const left = await ctx.db.collection('rounds').countDocuments({ roundName: 'ZR-OPEN probe' });
    check('fixture rounds removed', left === 0, `${left} left`);
  }
};

// ── Step 7: F-09 (decision B) only the SuperAdmin writes roles and permissions ──
steps[7] = async ({ admin, db, Client }) => {
  section('Step 7 (F-09): a roles:update holder can read roles/permissions but can no longer write them');
  const stamp = String(Date.now()).slice(-6);
  const email = `zzf09${stamp}@example.test`; const password = 'Zz9Probe12345';
  const made = { roles: [], user: null };
  const allTrue = { create: true, read: true, update: true, delete: true, import: true, export: true };
  try {
    const holder = await admin.post('/roles', { name: `ZZ F09 holder ${stamp}`, description: 'probe' });
    const target = await admin.post('/roles', { name: `ZZ F09 target ${stamp}`, description: 'probe' });
    check('SuperAdmin can still create roles (201)', holder.status === 201 && target.status === 201, `${holder.status} ${holder.message}`);
    if (holder.status !== 201 || target.status !== 201) return;
    made.roles.push(holder.data._id, target.data._id);
    const grant = await admin.put(`/permissions/${holder.data._id}`, { permissions: [{ module: 'roles', actions: allTrue }, { module: 'bookings', actions: { read: true } }] });
    check('SuperAdmin can still write permissions (200): the holder role gets roles:create/read/update/delete', grant.status === 200, `${grant.status} ${grant.message}`);
    const u = await admin.post('/users', { name: 'ZZ F09 user', email, password, roleId: holder.data._id });
    check('temp user with the holder role created', u.status === 201, `${u.status} ${u.message}`);
    if (u.status !== 201) return;
    made.user = u.data._id;
    const h = await new Client().login(email, password);
    check('temp user can log in', !!h);
    if (!h) return;

    check('holder: GET /roles still works (read is allowed)', (await h.get('/roles')).status === 200);
    check('holder: GET /permissions/<other role> still works (read is allowed)', (await h.get(`/permissions/${target.data._id}`)).status === 200);
    const wP = await h.put(`/permissions/${target.data._id}`, { permissions: [{ module: 'users', actions: allTrue }] });
    check('holder: PUT /permissions/<other role> -> 403 (cannot grant)', wP.status === 403 && /SuperAdmin/.test(wP.message), `${wP.status} ${wP.message}`);
    check('holder: PUT /permissions/<own role> -> 403', (await h.put(`/permissions/${holder.data._id}`, { permissions: [{ module: 'users', actions: allTrue }] })).status === 403);
    check('holder: POST /roles -> 403', (await h.post('/roles', { name: `ZZ F09 nope ${stamp}` })).status === 403);
    check('holder: PUT /roles/:id -> 403', (await h.put(`/roles/${target.data._id}`, { name: `ZZ F09 renamed ${stamp}` })).status === 403);
    check('holder: DELETE /roles/:id -> 403', (await h.del(`/roles/${target.data._id}`)).status === 403);
    const after = (await admin.get(`/permissions/${target.data._id}`)).data || [];
    check('nothing was granted: the target role has no users permission', !after.some((p) => p.module === 'users' && p.actions?.read));
    check('the target role still exists with its name', (await admin.get(`/roles/${target.data._id}`)).data?.name === `ZZ F09 target ${stamp}`);
  } finally {
    if (made.user) await db.collection('users').deleteOne({ _id: new (require('mongoose').Types.ObjectId)(made.user) });
    for (const id of made.roles) { await db.collection('permissions').deleteMany({ roleId: new (require('mongoose').Types.ObjectId)(id) }); await admin.del(`/roles/${id}`); }
    const left = (await db.collection('roles').countDocuments({ name: /^ZZ F09/ })) + (await db.collection('users').countDocuments({ email }));
    check('fixtures removed (no ZZ F09 role or user left)', left === 0, String(left));
  }
};

// ── Step 8: RV-40 the service code is locked once a round uses the service ──
steps[8] = async ({ admin, db }) => {
  section('Step 8 (RV-40): changing a service code is refused (409) once rounds use it; the name stays editable');
  const rounds = await admin.all('/rounds');
  const usedId = rounds.map((r) => idOf(r.serviceId)).find(Boolean);
  const used = usedId ? (await admin.get(`/services/${usedId}`)).data : null;
  let tmpId = null;
  try {
    if (!used) note('SKIP locked part: no service with rounds');
    else {
      const code = used.serviceCode; const name = used.serviceName;
      const r1 = await admin.put(`/services/${used._id}`, { serviceCode: `${code.slice(0, 5)}Z` });
      check(`service ${code} has rounds: changing its code -> 409 with a clear message`, r1.status === 409 && /round/.test(r1.message || ''), `${r1.status} ${r1.message}`);
      check('the code was not changed', (await admin.get(`/services/${used._id}`)).data?.serviceCode === code);
      const r2 = await admin.put(`/services/${used._id}`, { serviceCode: code.toLowerCase() });
      check('sending the same code in another case is not a change (200)', r2.status === 200 && r2.data?.serviceCode === code, `${r2.status} ${r2.message}`);
      const r3 = await admin.put(`/services/${used._id}`, { serviceName: `${name} (probe)` });
      check('the name can still be edited (200)', r3.status === 200 && r3.data?.serviceName === `${name} (probe)`, `${r3.status} ${r3.message}`);
      await admin.put(`/services/${used._id}`, { serviceName: name }); // restore
      check('name restored', (await admin.get(`/services/${used._id}`)).data?.serviceName === name);
    }
    // a service no round uses: the code may still change
    const t = await admin.post('/services', { serviceCode: 'ZQ9', serviceName: 'ZZ RV40 probe service' });
    if (t.status !== 201) note(`SKIP unlocked part: temp service not created (${t.status} ${t.message})`);
    else {
      tmpId = t.data._id;
      const c = await admin.put(`/services/${tmpId}`, { serviceCode: 'ZQ8' });
      check('a service with NO rounds: the code can change (200)', c.status === 200 && c.data?.serviceCode === 'ZQ8', `${c.status} ${c.message}`);
    }
  } finally {
    if (tmpId) await admin.del(`/services/${tmpId}`);
    const left = await db.collection('services').countDocuments({ serviceName: /^ZZ RV40/ });
    check('fixture service removed', left === 0, String(left));
  }
};

(async () => {
  const health = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
  if (!health) { console.error(`Server not reachable at ${BASE} - start it with npm run dev`); process.exit(2); }
  const admin = await new Client().login(process.env.ADMIN_EMAIL || 'admin@logistics.com', process.env.ADMIN_PASSWORD || 'Admin@123456');
  if (!admin) { console.error('admin login failed'); process.exit(2); }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`Open-items probe on database "${db.databaseName}" (${BASE})`);
  const want = process.argv.slice(2).map(Number);
  const ctx = { admin, db, Client, PASS, note, check, section, idOf };
  for (const n of Object.keys(steps).map(Number)) {
    if (want.length && !want.includes(n)) continue;
    try { await steps[n](ctx); } catch (e) { check(`step ${n} did not crash`, false, e.stack || e.message); }
  }
  await mongoose.disconnect();
  const bad = results.filter((r) => !r).length;
  console.log(`\n${results.length} checks, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('probe aborted:', e.stack || e.message); process.exit(1); });
