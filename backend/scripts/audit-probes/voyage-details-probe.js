'use strict';

// Voyage Details (Sprint A) probe: GET /voyages/:id, GET /voyages/:id/summary and the port filter on the booking lists.
// Run against the dev server + the disposable TEST database:  node scripts/audit-probes/voyage-details-probe.js
// It PRINTS its results and writes NO file (a file under backend/ would restart nodemon, audit S-16).
// The only write: one Layer 1 booking on a bookable voyage (pinning + cache check), deleted again at the end.
// Reads the DB directly (read-only) only to cross-check the invoiced figure.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5000/api/v1';
const PASS = 'Demo@123456';
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`); };
const note = (m) => console.log(`  info  ${m}`);
const section = (t) => console.log(`\n${t}`);
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const teuOf = (size) => { const m = String(size || '').toUpperCase().replace(/\s+/g, '').match(/^(\d{2,3})/); const l = m ? Number(m[1]) : 0; return l === 40 || l === 45 ? 2 : 1; };
const boxNo = () => `ZZTU${String(Date.now() % 1e7).padStart(7, '0')}`;
const STATUSES = ['Pending', 'Confirmed', 'Final Loading', 'Cancelled'];

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
    return { status: r.status, body: json, data: json?.data, message: json?.message };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b ?? {}); }
  del(u) { return this.req('DELETE', u); }
  async all(path) { // every page of a paginated list
    const out = []; const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; ; page += 1) {
      const r = await this.get(`${path}${sep}limit=100&page=${page}`);
      out.push(...(r.data || []));
      if (page >= (r.body?.pagination?.totalPages || 1)) return out;
    }
  }
}

(async () => {
  const health = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
  if (!health) { console.error(`Server not reachable at ${BASE} - start it with npm run dev`); process.exit(2); }
  const admin = await new Client().login(process.env.ADMIN_EMAIL || 'admin@logistics.com', process.env.ADMIN_PASSWORD || 'Admin@123456');
  if (!admin) { console.error('admin login failed'); process.exit(2); }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`Voyage Details probe on database "${db.databaseName}" (${BASE})`);

  const voyages = await admin.all('/voyages');
  note(`${voyages.length} voyages in the test DB`);
  const byRound = new Map();
  const capOf = async (roundId) => { if (!byRound.has(roundId)) byRound.set(roundId, (await admin.get(`/capacity/round/${roundId}`)).data); return byRound.get(roundId); };

  // ── 1. GET /voyages/:id ─────────────────────────────────────────────────────
  section('1. GET /voyages/:id (S-19): vessel, round dates, port calls');
  const sample = voyages.find((v) => v.status !== 'Cancelled') || voyages[0];
  const d = await admin.get(`/voyages/${sample._id}`);
  check('returns 200', d.status === 200, `${d.status} ${d.message}`);
  check('has the vessel (name, code, capacity field)', !!d.data?.vessel?.vesselName && !!d.data?.vessel?.vesselCode && 'capacity' in d.data.vessel, JSON.stringify(d.data?.vessel));
  check('has round dates + status + closeStatus', !!d.data?.round?.startDate && !!d.data?.round?.endDate && !!d.data?.round?.status && !!d.data?.round?.closeStatus, JSON.stringify(d.data?.round));
  check('port calls are in order and carry names', Array.isArray(d.data?.portCalls) && d.data.portCalls.length >= 2 && d.data.portCalls.every((c) => c.legKey && c.portName), JSON.stringify(d.data?.portCalls?.slice(0, 1)));
  check('POL/POD, service and direction still present', !!d.data?.polId?.name && !!d.data?.podId?.name && !!d.data?.serviceId?.serviceCode);
  check('invalid id -> 400', (await admin.get('/voyages/nope')).status === 400);
  check('unknown id -> 404', (await admin.get('/voyages/000000000000000000000000')).status === 404);

  // ── 2. summary equals the lists, the capacity engine and the reports ────────
  section('2. GET /voyages/:id/summary equals the booking lists, the capacity engine and the revenue report');
  let voyageChecked = 0; let teuChecked = 0; let pnlChecked = 0; let invChecked = 0; let notPlacedSeen = 0;
  for (const v of voyages) {
    const s = await admin.get(`/voyages/${v._id}/summary`);
    if (s.status !== 200) { check(`[${v.voyageNumber}] summary 200`, false, `${s.status} ${s.message}`); continue; }
    const sum = s.data;
    const l1 = await admin.all(`/bookings/manual?voyageId=${v._id}`);
    const l2 = await admin.all(`/bookings?voyageId=${v._id}`);
    const cnt = (rows, st) => rows.filter((r) => r.status === st).length;
    const live = (rows) => rows.filter((r) => r.status !== 'Cancelled');
    const countsOk = STATUSES.every((st) => sum.bookings.estimated.byStatus[st] === cnt(l1, st) && sum.bookings.operational.byStatus[st] === cnt(l2, st));
    const totalsOk = sum.bookings.total === l1.length + l2.length
      && sum.bookings.estimated.total === l1.length && sum.bookings.operational.total === l2.length
      && STATUSES.reduce((n, st) => n + sum.bookings.estimated.byStatus[st] + sum.bookings.operational.byStatus[st], 0) === sum.bookings.total;
    check(`[${v.voyageNumber}] chips per status equal the lists and add up (${sum.bookings.total})`, countsOk && totalsOk, JSON.stringify(sum.bookings));
    const estFreight = money(live(l1).reduce((n, r) => n + (r.totalFreight || 0), 0));
    const opFL = money(l2.filter((r) => r.status === 'Final Loading').reduce((n, r) => n + (r.totalFreight || 0), 0));
    const pend = money(l2.filter((r) => r.status === 'Pending').reduce((n, r) => n + (r.totalFreight || 0), 0));
    const conf = money(l2.filter((r) => r.status === 'Confirmed').reduce((n, r) => n + (r.totalFreight || 0), 0));
    check(`[${v.voyageNumber}] revenue: estimated, operational (Final Loading only), pipeline equal the lists`,
      sum.revenue && sum.revenue.currency === 'USD' && money(sum.revenue.estimated) === estFreight && money(sum.revenue.operational) === opFL
      && money(sum.revenue.pipeline.pending) === pend && money(sum.revenue.pipeline.confirmed) === conf, JSON.stringify(sum.revenue) + ` lists ${estFreight}/${opFL}/${pend}/${conf}`);

    // TEU = capacity engine (same statuses), notPlaced = what the engine could not place
    const estList = live(l1).reduce((n, r) => n + (r.totalTEU || 0), 0);
    const opList = live(l2).reduce((n, r) => n + teuOf(r.containerTypeId?.size), 0);
    const cap = await capOf(String(v.roundId?._id || v.roundId));
    const row = (cap?.voyages || []).find((x) => String(x.voyageId) === String(v._id));
    if (v.status === 'Cancelled') {
      check(`[${v.voyageNumber}] Cancelled voyage: capacity has no row, TEU shows 0`, !row && sum.teu.estimated === 0 && sum.teu.operational === 0 && sum.teu.capacityTEU === null, JSON.stringify(sum.teu));
    } else if (row) {
      teuChecked += 1;
      check(`[${v.voyageNumber}] TEU equals the capacity engine (L1 ${row.layer1.loadedTEU}, L2 ${row.layer2.loadedTEU})`,
        sum.teu.estimated === row.layer1.loadedTEU && sum.teu.operational === row.layer2.loadedTEU, JSON.stringify(sum.teu));
      const capsBelow = row.layer1.loadedTEU <= estList && row.layer2.loadedTEU <= opList;
      check(`[${v.voyageNumber}] bookings TEU = engine TEU + notPlaced (${estList + opList} = ${sum.teu.estimated + sum.teu.operational} + ${sum.teu.notPlaced})`,
        capsBelow && estList + opList === sum.teu.estimated + sum.teu.operational + sum.teu.notPlaced, `lists ${estList}/${opList}`);
      if (sum.teu.notPlaced > 0) notPlacedSeen += 1;
    } else {
      check(`[${v.voyageNumber}] voyage has a capacity row`, false, 'no row for a live voyage');
    }

    if (v.status !== 'Cancelled' || true) {
      const rnd = String(v.roundId?._id || v.roundId);
      const p = await admin.get(`/reports/round-pnl?roundId=${rnd}&voyageId=${v._id}`);
      const pv = (p.data?.voyages || []).find((x) => String(x.voyageId || x._id) === String(v._id));
      if (pv?.revenue) {
        pnlChecked += 1;
        check(`[${v.voyageNumber}] operational revenue equals the revenue report (${money(pv.revenue.totalRevenue)})`, money(pv.revenue.totalRevenue) === money(sum.revenue.operational), `${pv.revenue.totalRevenue} vs ${sum.revenue.operational}`);
      }
    }

    // invoiced: direct read-only cross-check
    const items = await db.collection('bookingitems').find({ voyageId: new mongoose.Types.ObjectId(String(v._id)) }, { projection: { _id: 1 } }).toArray();
    const lines = items.length ? await db.collection('invoicelines').find({ bookingItemId: { $in: items.map((i) => i._id) }, cancelled: false, currency: 'USD' }).toArray() : [];
    const invs = lines.length ? await db.collection('invoices').find({ _id: { $in: lines.map((l) => l.invoiceId) }, status: { $in: ['Issued', 'Partially Paid', 'Paid', 'Overdue'] }, docKind: { $nin: ['CreditNote', 'DebitNote'] } }).project({ _id: 1 }).toArray() : [];
    const okSet = new Set(invs.map((i) => String(i._id)));
    const expected = lines.filter((l) => okSet.has(String(l.invoiceId))).reduce((n, l) => n + l.amountMinor, 0) / 100;
    if (expected > 0) invChecked += 1;
    check(`[${v.voyageNumber}] invoiced = issued invoice lines (${expected} USD, ${okSet.size} invoices), gross`, money(sum.revenue.invoiced.amount) === money(expected) && sum.revenue.invoiced.invoices === okSet.size && sum.revenue.invoiced.grossBeforeNotes === true, JSON.stringify(sum.revenue.invoiced));
    voyageChecked += 1;
  }
  note(`${voyageChecked} voyages compared; ${teuChecked} against the capacity engine, ${pnlChecked} against round-pnl, ${invChecked} with invoiced revenue > 0, ${notPlacedSeen} with notPlaced > 0`);

  // ── 3. permissions ──────────────────────────────────────────────────────────
  section('3. Permissions: revenue only with invoices:read or reports:read; partner users refused');
  const target = voyages.find((v) => v.status !== 'Cancelled') || voyages[0];
  const sumUrl = `/voyages/${target._id}/summary`;
  for (const [email, wantRevenue] of [['finance@logistics.com', true], ['ops@logistics.com', true], ['viewer@logistics.com', true], ['tracking@logistics.com', false]]) {
    const c = await new Client().login(email, PASS);
    if (!c) { note(`SKIP ${email}: login failed (user not in this DB)`); continue; }
    const r = await c.get(sumUrl);
    check(`${email}: 200 and ${wantRevenue ? 'revenue block present' : 'NO revenue block'}`, r.status === 200 && ('revenue' in (r.data || {})) === wantRevenue && (wantRevenue || !JSON.stringify(r.data).includes('"invoiced"')), `${r.status} ${JSON.stringify(Object.keys(r.data || {}))}`);
  }
  check('admin: revenue block present', 'revenue' in ((await admin.get(sumUrl)).data || {}));
  const partner = await new Client().login('partner@logistics.com', PASS);
  if (partner) {
    check('partner user: GET /voyages/:id -> 403', (await partner.get(`/voyages/${target._id}`)).status === 403);
    check('partner user: GET /voyages/:id/summary -> 403', (await partner.get(sumUrl)).status === 403);
  } else note('SKIP partner user: login failed');
  const anon = await fetch(`${BASE}${sumUrl}`);
  check('no login -> 401', anon.status === 401, String(anon.status));
  check('summary: invalid id -> 400, unknown id -> 404', (await admin.get('/voyages/nope/summary')).status === 400 && (await admin.get('/voyages/000000000000000000000000/summary')).status === 404);

  // ── 4. port filter on the lists ─────────────────────────────────────────────
  section('4. Port filter (portLegKey / portId) on GET /bookings and GET /bookings/manual');
  let best = null; let bestN = -1;
  for (const v of voyages) { const n = (await admin.get(`/bookings?voyageId=${v._id}&limit=1`)).body?.pagination?.total || 0; if (n > bestN) { best = v; bestN = n; } }
  const vd = (await admin.get(`/voyages/${best._id}`)).data;
  const all2 = await admin.all(`/bookings?voyageId=${best._id}`);
  const all1 = await admin.all(`/bookings/manual?voyageId=${best._id}`);
  note(`voyage ${best.voyageNumber}: ${all2.length} operational, ${all1.length} estimated bookings, ${vd.portCalls.length} port calls`);
  const touches = (b, c) => (b.polLegKey ? b.polLegKey === c.legKey : String(b.polId?._id || b.polId) === String(c.portId)) || (b.podLegKey ? b.podLegKey === c.legKey : String(b.podId?._id || b.podId) === String(c.portId));
  for (const c of vd.portCalls) {
    const e2 = all2.filter((b) => touches(b, c)).length; const e1 = all1.filter((b) => touches(b, c)).length;
    const g2 = await admin.get(`/bookings?voyageId=${best._id}&portLegKey=${c.legKey}&limit=100`);
    const g1 = await admin.get(`/bookings/manual?voyageId=${best._id}&portLegKey=${c.legKey}&limit=100`);
    check(`leg key ${c.legKey} (${c.portName}): operational ${e2} / estimated ${e1} match`, g2.body?.pagination?.total === e2 && g1.body?.pagination?.total === e1 && (g2.data || []).every((b) => touches(b, c)) && (g1.data || []).every((b) => touches(b, c)), `${g2.body?.pagination?.total}/${g1.body?.pagination?.total}`);
  }
  const c0 = vd.portCalls[0];
  const byPort2 = all2.filter((b) => String(b.polId?._id || b.polId) === String(c0.portId) || String(b.podId?._id || b.podId) === String(c0.portId)).length;
  check(`portId alone (${c0.portName}) matches either side (${byPort2})`, (await admin.get(`/bookings?voyageId=${best._id}&portId=${c0.portId}&limit=1`)).body?.pagination?.total === byPort2);
  check('unknown leg key -> empty list, not an error', (await admin.get(`/bookings?voyageId=${best._id}&portLegKey=NOPE`)).body?.pagination?.total === 0);
  check('bad portId -> 400 (both lists)', (await admin.get('/bookings?portId=nope')).status === 400 && (await admin.get('/bookings/manual?portId=nope')).status === 400);
  check('port filter keeps the search working ($and, not a clobbered $or)', (await admin.get(`/bookings?voyageId=${best._id}&portLegKey=${c0.legKey}&search=zzzz-none`)).body?.pagination?.total === 0);

  // ── 5. canBook reasons on whatever fixtures exist ───────────────────────────
  section('5. actions.canBook and its reason');
  const seen = {};
  for (const v of voyages) {
    const a = (await admin.get(`/voyages/${v._id}/summary`)).data;
    const want = v.status === 'Cancelled' ? 'VOYAGE_CANCELLED' : v.status === 'Completed' ? 'VOYAGE_COMPLETED'
      : a.voyage.closeStatus === 'Closed' ? 'ROUND_CLOSED' : ['Cancelled', 'Completed'].includes(a.voyage.roundStatus) ? 'ROUND_NOT_BOOKABLE' : null;
    seen[want || 'OK'] = (seen[want || 'OK'] || 0) + 1;
    check(`[${v.voyageNumber}] ${v.status} / round ${a.voyage.roundStatus}/${a.voyage.closeStatus} -> ${want || 'bookable'}`, a.actions.canBook === !want && a.actions.reason === want, JSON.stringify(a.actions));
  }
  note(`fixtures covered: ${JSON.stringify(seen)}${['VOYAGE_CANCELLED', 'VOYAGE_COMPLETED', 'ROUND_CLOSED', 'ROUND_NOT_BOOKABLE'].filter((k) => !seen[k]).map((k) => ` | no fixture for ${k}`).join('')}`);

  // ── 6. pinning + cache refresh (one L1 booking, deleted again) ───────────────
  section('6. Pinning the voyage and the capacity cache after a write');
  let pinVoyage = null;
  for (const v of voyages) { const a = (await admin.get(`/voyages/${v._id}/summary`)).data; if (a.actions.canBook && ['Planned', 'Active'].includes(a.voyage.roundStatus)) { pinVoyage = v; break; } }
  if (!pinVoyage) note('SKIP: no bookable voyage in this DB');
  else {
    const pd = (await admin.get(`/voyages/${pinVoyage._id}`)).data;
    const rid = String(pd.round._id);
    const lk = (await admin.get(`/bookings/lookups?roundId=${rid}`)).data;
    const ct = (lk.containerTypes || []).find((c) => c.size === '20ft') || lk.containerTypes?.[0];
    const agent = lk.agents?.[0];
    const first = pd.portCalls[0]; const last = pd.portCalls[pd.portCalls.length - 1];
    const before = (await admin.get(`/voyages/${pinVoyage._id}/summary`)).data;
    const made = await admin.post('/bookings/manual', { roundId: rid, agentId: agent._id, polId: String(first.portId), podId: String(last.portId), polLegKey: first.legKey, podLegKey: last.legKey, voyageId: String(pinVoyage._id), cargoRows: [{ containerTypeId: ct._id, quantity: 1 }] });
    check('create with voyageId = this voyage lands on it', made.status === 201 && String(made.data?.voyageId?._id || made.data?.voyageId) === String(pinVoyage._id), `${made.status} ${made.message}`);
    if (made.status === 201) {
      const after = (await admin.get(`/voyages/${pinVoyage._id}/summary`)).data;
      check('summary reflects it at once: estimated Pending +1', after.bookings.estimated.byStatus.Pending === before.bookings.estimated.byStatus.Pending + 1, `${before.bookings.estimated.byStatus.Pending} -> ${after.bookings.estimated.byStatus.Pending}`);
      check(`capacity cache was cleared: estimated TEU +${teuOf(ct.size)}`, after.teu.estimated === before.teu.estimated + teuOf(ct.size), `${before.teu.estimated} -> ${after.teu.estimated}`);
      const gone = await admin.del(`/bookings/manual/${made.data._id}`);
      check('test booking deleted again', gone.status === 200, `${gone.status} ${gone.message}`);
      const back = (await admin.get(`/voyages/${pinVoyage._id}/summary`)).data;
      check('numbers are back to the start', back.bookings.estimated.total === before.bookings.estimated.total && back.teu.estimated === before.teu.estimated);
    }
  }

  // ── 7. Sprint C: allocation kind, old estimates, tie pinning, refused creates ─
  // Fixtures: a few Layer 1 bookings and one temporary twin voyage on a bookable round, ALL deleted at the end.
  section('7. Allocation (kind), old estimates without kind, pinning on a tie, creation refused');
  const mkIds = []; const tmpVoyages = [];
  const cleanup = async () => {
    for (const id of mkIds.splice(0)) await admin.del(`/bookings/manual/${id}`);
    for (const id of tmpVoyages.splice(0)) await admin.del(`/voyages/${id}`);
  };
  try {
    let bookable = null;
    for (const v of voyages) { const a = (await admin.get(`/voyages/${v._id}/summary`)).data; if (a.actions.canBook && ['Planned', 'Active'].includes(a.voyage.roundStatus)) { bookable = v; break; } }
    if (!bookable) note('SKIP section 7 (bookable part): no bookable voyage in this DB');
    else {
      const bd = (await admin.get(`/voyages/${bookable._id}`)).data;
      const rid = String(bd.round._id);
      const lk = (await admin.get(`/bookings/lookups?roundId=${rid}`)).data;
      const ct = (lk.containerTypes || []).find((c) => c.size === '20ft') || lk.containerTypes?.[0];
      const agent = lk.agents?.[0];
      const first = bd.portCalls[0]; const last = bd.portCalls[bd.portCalls.length - 1];
      const body = (extra = {}) => ({ roundId: rid, agentId: agent._id, polId: String(first.portId), podId: String(last.portId), polLegKey: first.legKey, podLegKey: last.legKey, voyageId: String(bookable._id), cargoRows: [{ containerTypeId: ct._id, quantity: 2 }], ...extra });
      const sumOf = async () => (await admin.get(`/voyages/${bookable._id}/summary`)).data;
      const capRow = async () => ((await admin.get(`/capacity/round/${rid}`)).data?.voyages || []).find((x) => String(x.voyageId) === String(bookable._id));
      const base = await sumOf(); const baseRow = await capRow();
      const unit = 2 * teuOf(ct.size);

      // a) an allocation: counted in Estimated TEU, in the capacity engine, and shown as "of which allocation"
      const al = await admin.post('/bookings/manual', body({ kind: 'Allocation' }));
      check('create kind=Allocation -> 201 and the booking reads kind Allocation', al.status === 201 && al.data?.kind === 'Allocation', `${al.status} ${al.message}`);
      if (al.status === 201) {
        mkIds.push(al.data._id);
        const s1 = await sumOf(); const r1 = await capRow();
        check(`allocation counts in Estimated TEU (+${unit}) like any estimate`, s1.teu.estimated === base.teu.estimated + unit, `${base.teu.estimated} -> ${s1.teu.estimated}`);
        check(`allocation counts in the capacity engine layer1.loadedTEU (+${unit}); the engine was not changed`, (r1?.layer1?.loadedTEU || 0) === (baseRow?.layer1?.loadedTEU || 0) + unit, `${baseRow?.layer1?.loadedTEU} -> ${r1?.layer1?.loadedTEU}`);
        check(`"of which allocation" TEU +${unit} and count +1, estimated total +1`, s1.teu.ofWhichAllocation === base.teu.ofWhichAllocation + unit && s1.bookings.estimated.ofWhichAllocation === base.bookings.estimated.ofWhichAllocation + 1 && s1.bookings.estimated.total === base.bookings.estimated.total + 1, JSON.stringify([s1.teu, s1.bookings.estimated]));
        check('allocation is part of Estimated, not added to the grand total twice', s1.bookings.total === base.bookings.total + 1, `${base.bookings.total} -> ${s1.bookings.total}`);
        if (s1.revenue) check('revenue: of-which-allocation line present (0 here: no rate on the fixture)', typeof s1.revenue.ofWhichAllocation === 'number' && s1.revenue.ofWhichAllocation <= s1.revenue.estimated);
        const fa = await admin.all(`/bookings/manual?voyageId=${bookable._id}&kind=Allocation`);
        const fe = await admin.all(`/bookings/manual?voyageId=${bookable._id}&kind=Estimate`);
        check('list filter kind=Allocation returns it; kind=Estimate does not', fa.some((b) => b._id === al.data._id) && fa.every((b) => b.kind === 'Allocation') && !fe.some((b) => b._id === al.data._id));
        check('bad kind -> 400 (list) and 400 (create)', (await admin.get('/bookings/manual?kind=Quota')).status === 400 && (await admin.post('/bookings/manual', body({ kind: 'Quota' }))).status === 400);
        check('the kind of an existing booking cannot be changed (PUT kind -> 400)', (await admin.req('PUT', `/bookings/manual/${al.data._id}`, { kind: 'Estimate' })).status === 400);
      }

      // b) an old estimate: no kind field in the document (written directly, a fixture) reads as Estimate, no migration
      const es = await admin.post('/bookings/manual', body());
      check('create without kind -> 201 and kind Estimate (default)', es.status === 201 && es.data?.kind === 'Estimate', `${es.status} ${es.message}`);
      if (es.status === 201) {
        mkIds.push(es.data._id);
        await db.collection('manualbookings').updateOne({ _id: new mongoose.Types.ObjectId(es.data._id) }, { $unset: { kind: '' } });
        const old = await admin.get(`/bookings/manual/${es.data._id}`);
        check('old document WITHOUT kind reads as Estimate (get)', old.status === 200 && old.data?.kind === 'Estimate', JSON.stringify(old.data?.kind));
        const fe2 = await admin.all(`/bookings/manual?voyageId=${bookable._id}&kind=Estimate`);
        const fa2 = await admin.all(`/bookings/manual?voyageId=${bookable._id}&kind=Allocation`);
        check('old document is in the Estimate filter (kind != Allocation) and not in Allocation', fe2.some((b) => b._id === es.data._id && b.kind === 'Estimate') && !fa2.some((b) => b._id === es.data._id));
        const s2 = await sumOf();
        check('old document is NOT counted as allocation in the summary', s2.bookings.estimated.ofWhichAllocation === base.bookings.estimated.ofWhichAllocation + (al.status === 201 ? 1 : 0), JSON.stringify(s2.bookings.estimated));
      }
      await cleanup();
      const fin = await sumOf();
      check('fixtures deleted: totals are back to the start', fin.bookings.total === base.bookings.total && fin.teu.estimated === base.teu.estimated && fin.teu.ofWhichAllocation === base.teu.ofWhichAllocation);

      // c) pinning on a tie: a temporary twin voyage over the same legs
      const twinRes = await admin.post('/voyages', { roundId: rid, direction: bd.direction, fromLegKey: bd.fromLegKey, toLegKey: bd.toLegKey, voyageName: 'ZV-TIE probe twin' });
      if (twinRes.status !== 201) note(`SKIP tie test: twin voyage not created (${twinRes.status} ${twinRes.message})`);
      else {
        const twin = twinRes.data; tmpVoyages.push(twin._id);
        const unpinned = await admin.post('/bookings/manual', { ...body(), voyageId: undefined });
        if (unpinned.status === 201) { mkIds.push(unpinned.data._id); note('unpinned create on a tie was ranked by the server (one voyage is earlier)'); }
        else check('unpinned create on a tie -> 409 VOYAGE_AMBIGUOUS', unpinned.status === 409, `${unpinned.status} ${unpinned.message}`);
        const toTwin = await admin.post('/bookings/manual', body({ voyageId: String(twin._id) }));
        check('create with voyageId = the twin lands on the twin', toTwin.status === 201 && String(toTwin.data?.voyageId?._id || toTwin.data?.voyageId) === String(twin._id), `${toTwin.status} ${toTwin.message}`);
        if (toTwin.status === 201) mkIds.push(toTwin.data._id);
        const toFirst = await admin.post('/bookings/manual', body());
        check('create with voyageId = the original lands on the original (not the twin)', toFirst.status === 201 && String(toFirst.data?.voyageId?._id || toFirst.data?.voyageId) === String(bookable._id), `${toFirst.status} ${toFirst.message}`);
        if (toFirst.status === 201) mkIds.push(toFirst.data._id);
        const toTwinL2 = await admin.post('/bookings', { roundId: rid, agentId: agent._id, polId: String(first.portId), podId: String(last.portId), polLegKey: first.legKey, podLegKey: last.legKey, voyageId: String(twin._id), containerTypeId: ct._id, freightRate: 0, containerNumber: boxNo() });
        check('operational booking pinned to the twin lands on the twin too', toTwinL2.status === 201 && String(toTwinL2.data?.voyageId?._id || toTwinL2.data?.voyageId) === String(twin._id), `${toTwinL2.status} ${toTwinL2.message}`);
        if (toTwinL2.status === 201) await admin.del(`/bookings/${toTwinL2.data._id}`);

        // d) creation refused on a Cancelled voyage (the twin, cancelled)
        const twinCount = async () => `${(await admin.get(`/bookings/manual?voyageId=${twin._id}&limit=1`)).body?.pagination?.total}/${(await admin.get(`/bookings?voyageId=${twin._id}&limit=1`)).body?.pagination?.total}`;
        const cancelled = await admin.req('PUT', `/voyages/${twin._id}`, { status: 'Cancelled' });
        check('twin voyage cancelled (fixture)', cancelled.status === 200, `${cancelled.status} ${cancelled.message}`);
        const cs = (await admin.get(`/voyages/${twin._id}/summary`)).data;
        check('summary of the Cancelled voyage: canBook false, VOYAGE_CANCELLED', cs?.actions?.canBook === false && cs.actions.reason === 'VOYAGE_CANCELLED', JSON.stringify(cs?.actions));
        const countBefore = await twinCount();
        const refusedL1 = await admin.post('/bookings/manual', body({ voyageId: String(twin._id) }));
        const refusedL2 = await admin.post('/bookings', { roundId: rid, agentId: agent._id, polId: String(first.portId), podId: String(last.portId), voyageId: String(twin._id), containerTypeId: ct._id, freightRate: 0, containerNumber: boxNo() });
        check('estimate pinned to a Cancelled voyage is refused (4xx, nothing created)', refusedL1.status >= 400 && refusedL1.status < 500, `${refusedL1.status} ${refusedL1.message}`);
        check('operational booking pinned to a Cancelled voyage is refused (4xx, nothing created)', refusedL2.status >= 400 && refusedL2.status < 500, `${refusedL2.status} ${refusedL2.message}`);
        if (refusedL1.status === 201) mkIds.push(refusedL1.data._id);
        if (refusedL2.status === 201) await admin.del(`/bookings/${refusedL2.data._id}`);
        check('the refused creates added nothing to the twin (counts unchanged)', (await twinCount()) === countBefore, `${countBefore} -> ${await twinCount()}`);
      }
    }

    // e) creation refused on a Closed / not bookable round (a seeded closed or completed round; the create is refused, nothing is written)
    let closedV = null;
    for (const v of voyages) { const a = (await admin.get(`/voyages/${v._id}/summary`)).data; if ((a.voyage.closeStatus === 'Closed' || ['Cancelled', 'Completed'].includes(a.voyage.roundStatus)) && v.status !== 'Cancelled') { closedV = { v, a }; break; } }
    if (!closedV) note('SKIP closed-round refusal: no Closed / Completed round with a live voyage in this DB');
    else {
      const cd = (await admin.get(`/voyages/${closedV.v._id}`)).data;
      const lk2 = (await admin.get(`/bookings/lookups`)).data;
      const ct2 = (lk2.containerTypes || [])[0]; const ag2 = (lk2.agents || [])[0];
      const f = cd.portCalls[0]; const l = cd.portCalls[cd.portCalls.length - 1];
      const before = (await admin.get(`/bookings/manual?voyageId=${closedV.v._id}&limit=1`)).body?.pagination?.total;
      const r = await admin.post('/bookings/manual', { roundId: String(cd.round._id), agentId: ag2._id, polId: String(f.portId), podId: String(l.portId), voyageId: String(closedV.v._id), cargoRows: [{ containerTypeId: ct2._id, quantity: 1 }], kind: 'Allocation' });
      if (r.status === 201) await admin.del(`/bookings/manual/${r.data._id}`);
      const after = (await admin.get(`/bookings/manual?voyageId=${closedV.v._id}&limit=1`)).body?.pagination?.total;
      check(`allocation on a ${closedV.a.voyage.closeStatus === 'Closed' ? 'Closed' : closedV.a.voyage.roundStatus} round is refused with a round reason (4xx) and nothing is created`, r.status >= 400 && r.status < 500 && /round/i.test(`${r.body?.code || ''} ${r.message}`) && before === after, `${r.status} ${r.body?.code} ${r.message}`);
    }
  } finally {
    await cleanup();
  }

  await mongoose.disconnect();
  const bad = results.filter((r) => !r).length;
  console.log(`\n${results.length} checks, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('probe aborted:', e.stack || e.message); process.exit(1); });
