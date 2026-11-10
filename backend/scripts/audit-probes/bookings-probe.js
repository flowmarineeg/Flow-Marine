'use strict';
// Regression probe for the bookings sprint (2026-11-10): voyage auto-assignment from POL/POD, partner label and
// partner users, Excel import (FL-02 / FL-03 / FL-04) and the POL->POD discharge list. Runs against a RUNNING dev
// server on the disposable test DB; creates its own ZB* fixtures and removes what it can afterwards.
//   node scripts/audit-probes/bookings-probe.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5000/api/v1';
const RUN = Date.now().toString(36).toUpperCase().slice(-5);
const out = [];

class Client {
  async login(email, password) {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (r.status !== 200) throw new Error(`login ${email} -> ${r.status}`);
    this.token = (r.headers.getSetCookie().find((c) => c.startsWith('token=')) || '').split(';')[0].slice(6);
    this.csrf = r.headers.get('x-csrf-token');
    return this;
  }
  async req(method, url, body, raw) {
    const headers = { Cookie: `token=${this.token}` };
    if (method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${BASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (raw) return { status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength };
    let json = null; try { json = await r.json(); } catch { /* */ }
    return { status: r.status, data: json?.data, code: json?.code, message: json?.message, errors: json?.errors, body: json };
  }
  get(u, raw) { return this.req('GET', u, undefined, raw); } post(u, b) { return this.req('POST', u, b ?? {}); }
  put(u, b) { return this.req('PUT', u, b); } del(u) { return this.req('DELETE', u); }
}
const list = (r) => (Array.isArray(r.data) ? r.data : []);
const id = (x) => String(x?._id || x);
const probe = (key, title, expected, observed, ok) => {
  out.push({ key, title, expected, observed, ok });
  console.log(`${ok ? 'ok    ' : 'DEFECT'} ${key}  ${title}\n         expected: ${expected}\n         observed: ${observed}`);
};
const sum = (r) => `${r.status} ${r.message || ''}${r.errors && r.errors.length ? ' ' + JSON.stringify(r.errors).slice(0, 160) : ''}`.trim();
const cleanup = [];
let cn = 0;
const box = () => `ZBU${RUN}${String(++cn).padStart(4, '0')}`;

(async () => {
  const admin = await new Client().login(process.env.ADMIN_EMAIL || 'admin@logistics.com', process.env.ADMIN_PASSWORD || 'Admin@123456');

  // ── fixtures: a 4-port route, a vessel, an Active round with east / west / second east runs ─────────────────
  const ports = list(await admin.get('/locations/ports?limit=100')).filter((p) => !/^E2E|^ZB/.test(p.name));
  if (ports.length < 5) throw new Error('need >= 5 seeded ports');
  const [P1, P2, P3, P4, P5] = ports;
  const leg = (p) => ({ countryId: id(p.countryId), cityId: id(p.cityId), portId: id(p) });
  const rev = list(await admin.get('/ledger/account-lookup?rule=revenue'))[0]._id;
  const agents = list(await admin.get('/agents?limit=5'));
  const cts = list(await admin.get('/container-types?limit=5'));
  if (!agents.length || !cts.length) throw new Error('need seeded agents and container types');
  const AG = agents[0]; const CT = cts[0];

  const vessel = await admin.post('/vessels', { vesselCode: `ZBV${RUN}`, vesselName: `ZB Probe Vessel ${RUN}`, ownershipType: 'Owned', imoNumber: String(7100000 + Math.floor(Math.random() * 899999)), callSign: `ZB${RUN}`, capacity: 1000, defaultDailyHireRate: 100 });
  if (vessel.status !== 201) throw new Error('vessel fixture: ' + sum(vessel));
  cleanup.push(() => admin.del(`/vessels/${vessel.data._id}`));
  const svc = await admin.post('/services', { serviceCode: `ZBS${RUN}`, serviceName: `ZB Probe Service ${RUN}`, revenueAccountId: rev });
  if (svc.status !== 201) throw new Error('service fixture: ' + sum(svc));
  cleanup.push(() => admin.del(`/services/${svc.data._id}`));
  const rt = await admin.put(`/services/${svc.data._id}/route`, { legs: [P1, P2, P3, P4].map(leg) });
  if (rt.status !== 200) throw new Error('route fixture: ' + sum(rt));
  const round = await admin.post('/rounds', { serviceId: svc.data._id, vesselId: vessel.data._id, roundName: `ZB Probe Round ${RUN}`, startDate: '2031-01-01', endDate: '2031-04-01', status: 'Active' });
  if (round.status !== 201) throw new Error('round fixture: ' + sum(round));
  const RID = round.data.round._id;
  cleanup.unshift(() => admin.del(`/rounds/${RID}`));
  const legs = list(await admin.get(`/voyages/round-ports/${RID}`));
  const run = async (dir, from, to, name) => {
    const r = await admin.post('/voyages', { roundId: RID, direction: dir, fromLegKey: legs[from].legKey, toLegKey: legs[to].legKey, voyageName: name });
    if (r.status !== 201) throw new Error('voyage fixture: ' + sum(r));
    cleanup.unshift(() => admin.del(`/voyages/${r.data._id}`));
    return r.data;
  };
  const E1 = await run('East', 0, 3, 'ZB east 1');
  const W1 = await run('West', 3, 0, 'ZB west 1');
  const created = []; // bookings, removed in cleanup
  const mkBk = async (cl, over = {}) => {
    const r = await cl.post('/bookings', { roundId: RID, agentId: id(AG), containerTypeId: id(CT), freightRate: 100, containerNumber: box(), containerStatus: 'Full', polId: id(P1), podId: id(P4), ...over });
    if (r.status === 201) created.push(r.data._id);
    return r;
  };
  const vNum = (r) => r.data?.voyageId?.voyageNumber;

  // ── 1. automatic voyage, direction, intermediate ports ──────────────────────
  console.log('\n[1] Voyage assigned from POL/POD');
  const a1 = await mkBk(admin);
  probe('BK-01', 'Booking P1 -> P4 (no voyage sent)', `201, eastbound ${E1.voyageNumber}`, `${sum(a1)} voyage=${vNum(a1)}`, a1.status === 201 && vNum(a1) === E1.voyageNumber);
  const a2 = await mkBk(admin, { polId: id(P4), podId: id(P1) });
  probe('BK-02', 'Booking P4 -> P1 (return)', `201, westbound ${W1.voyageNumber}`, `${sum(a2)} voyage=${vNum(a2)}`, a2.status === 201 && vNum(a2) === W1.voyageNumber);
  const a3 = await mkBk(admin, { polId: id(P2), podId: id(P3) });
  probe('BK-03', 'Booking between two intermediate ports P2 -> P3 (east)', `201, ${E1.voyageNumber}, own POL/POD kept`, `${sum(a3)} voyage=${vNum(a3)} pol=${id(a3.data?.polId)} pod=${id(a3.data?.podId)}`,
    a3.status === 201 && vNum(a3) === E1.voyageNumber && id(a3.data.polId) === id(P2) && id(a3.data.podId) === id(P3) && a3.data.polLegKey === legs[1].legKey && a3.data.podLegKey === legs[2].legKey);
  const a4 = await mkBk(admin, { polId: id(P3), podId: id(P2) });
  probe('BK-04', 'Booking P3 -> P2 (west, intermediate)', `201, ${W1.voyageNumber}`, `${sum(a4)} voyage=${vNum(a4)}`, a4.status === 201 && vNum(a4) === W1.voyageNumber);
  const a5 = await mkBk(admin, { polId: id(P2), podId: id(P2) });
  probe('BK-05', 'POL = POD', '400', sum(a5), a5.status === 400);
  const a6 = await mkBk(admin, { polId: id(P1), podId: id(P5) });
  probe('BK-06', 'POD that is not on any run of the round', '400 no voyage runs POL -> POD', sum(a6), a6.status === 400);
  const a7 = await mkBk(admin, { voyageId: id(W1), polId: id(P1), podId: id(P4) });
  probe('BK-07', 'Client-chosen voyage that runs the opposite way', '400 (the voyage cannot be forced)', sum(a7), a7.status === 400);
  const rv = await admin.post('/bookings/resolve-voyage', { roundId: RID, polId: id(P2), podId: id(P4) });
  probe('BK-08', 'resolve-voyage previews the voyage without writing', `resolved ${E1.voyageNumber}`, `${rv.status} ${rv.data?.status} ${rv.data?.voyage?.voyageNumber}`, rv.status === 200 && rv.data?.status === 'resolved' && rv.data.voyage.voyageNumber === E1.voyageNumber);
  const m1 = await admin.post('/bookings/manual', { roundId: RID, agentId: id(AG), polId: id(P2), podId: id(P4), cargoRows: [{ containerTypeId: id(CT), quantity: 2, rate: 50 }] });
  if (m1.status === 201) cleanup.unshift(() => admin.del(`/bookings/manual/${m1.data._id}`));
  probe('BK-09', 'Layer 1 booking P2 -> P4 gets the voyage too', `201, ${E1.voyageNumber}`, `${sum(m1)} voyage=${m1.data?.voyageId?.voyageNumber}`, m1.status === 201 && m1.data.voyageId.voyageNumber === E1.voyageNumber);

  // ── 2. two runs for the same pair ───────────────────────────────────────────
  console.log('\n[2] Several runs cover the same POL -> POD');
  const E2 = await run('East', 0, 3, 'ZB east 2');
  const b1 = await mkBk(admin);
  const cand = (b1.errors || []).map((c) => c.voyageId);
  probe('BK-10', 'Second eastbound run with no dates: the pair is ambiguous', '409 + both candidates', `${sum(b1)}`, b1.status === 409 && cand.includes(id(E1)) && cand.includes(id(E2)));
  const b2 = await mkBk(admin, { voyageId: id(E2) });
  probe('BK-11', 'Re-send with the chosen candidate', `201 on ${E2.voyageNumber}`, `${sum(b2)} voyage=${vNum(b2)}`, b2.status === 201 && vNum(b2) === E2.voyageNumber);
  const b3 = await mkBk(admin, { polId: id(P4), podId: id(P1) });
  probe('BK-12', 'The westbound pair is still unique', `201 on ${W1.voyageNumber}`, `${sum(b3)} voyage=${vNum(b3)}`, b3.status === 201 && vNum(b3) === W1.voyageNumber);

  // ── 2b. capacity per leg, both layers (R10 file rewritten 2026-11-10) ─────────
  console.log('\n[2b] Capacity per leg');
  const tOf = (sz) => (/^20/.test(String(sz)) ? 1 : 2);
  const t = tOf(CT.size);
  const capR = await admin.get(`/capacity/round/${RID}`);
  const rowE1 = (capR.data?.voyages || []).find((v) => v.voyageNumber === E1.voyageNumber);
  const segOn = (rowE1?.segments || []).map((x) => x.onboardTEU);
  probe('CP-01', 'East run P1-P2-P3-P4 with a P1->P4 container, a P2->P3 container and a P2->P4 estimate (qty 2)', `3 segments aboard [${t}, ${4 * t}, ${3 * t}] TEU`, JSON.stringify(segOn),
    segOn.length === 3 && segOn[0] === t && segOn[1] === 4 * t && segOn[2] === 3 * t);
  probe('CP-02', 'Voyage row peak, remaining and layer split', `peak ${4 * t}, remaining ${1000 - 4 * t}, L1 loaded ${2 * t}`, `peak=${rowE1?.onboardTEU} remaining=${rowE1?.remainingTEU} l1=${rowE1?.layer1?.loadedTEU}`,
    rowE1?.onboardTEU === 4 * t && rowE1?.remainingTEU === 1000 - 4 * t && rowE1?.layer1?.loadedTEU === 2 * t);
  const rowW1 = (capR.data?.voyages || []).find((v) => v.voyageNumber === W1.voyageNumber);
  const wOn = (rowW1?.segments || []).map((x) => x.onboardTEU);
  probe('CP-03', 'Westbound run: two P4->P1 containers and one P3->P2 container sit on the reversed legs', `segments P4>P3 ${2 * t}, P3>P2 ${3 * t}, P2>P1 ${2 * t}`, JSON.stringify(wOn), wOn.length === 3 && wOn[0] === 2 * t && wOn[1] === 3 * t && wOn[2] === 2 * t);
  const noWarn = (capR.data?.warnings || []).filter((w) => /NOT_IN_ROUND/.test(w.code));
  probe('CP-04', 'Intermediate-port bookings are counted, not dropped (FL-01 / BK-02)', 'no BOOKING_PORT_NOT_IN_ROUND warnings', String(noWarn.length), noWarn.length === 0);
  const pv = await admin.post('/capacity/preview', { roundId: RID, voyageId: id(E1), containerTypeId: id(CT), polId: id(P2), podId: id(P3) });
  probe('CP-05', 'Preview for one more container P2->P3', `canFit, remaining after ${1000 - 5 * t}`, `${sum(pv)} fit=${pv.data?.canFit} rem=${pv.data?.voyage?.remainingAfter}`,
    pv.status === 200 && pv.data.canFit === true && pv.data.voyage.remainingAfter === 1000 - 5 * t);

  // ── 3. Excel import: FL-02 / FL-03 / FL-04 ──────────────────────────────────
  console.log('\n[3] Excel import');
  const e2Live = list(await admin.get(`/bookings?voyageId=${id(E2)}&limit=50`)).filter((x) => x.status !== 'Cancelled').length;
  const cx = await admin.put(`/voyages/${id(E2)}`, { status: 'Cancelled' }); // back to a single live eastbound run
  const e2After = list(await admin.get(`/bookings?voyageId=${id(E2)}&limit=50`));
  probe('VC-01', 'Cancelling a voyage cancels all its bookings', `${e2Live} live booking(s) before, all Cancelled after, response reports them`, `${sum(cx)} cancelled=${JSON.stringify(cx.data?.cancelled)} statuses=${e2After.map((x) => x.status).join(',')}`,
    e2Live >= 1 && cx.status === 200 && e2After.length >= 1 && e2After.every((x) => x.status === 'Cancelled') && cx.data?.cancelled?.bookings === e2Live);
  const row = (over = {}) => ({ containerNumber: box(), containerType: CT.code, containerStatus: 'Full', pol: P1.name, pod: P4.name, rate: '120', ...over });
  const imp = (rows, importType = 'booking', extra = {}) => admin.post('/bookings/import/save', { rows, agentId: id(AG), roundId: RID, importType, ...extra });
  const prev = await admin.post('/bookings/import/preview', { rows: [row(), row({ pol: P2.name, pod: P3.name }), row({ pol: P1.name, pod: P5.name })], agentId: id(AG), roundId: RID, importType: 'booking' });
  const pr = list(prev);
  probe('IM-01', 'Preview assigns voyages by POL/POD, flags a pair no run serves', 'row1+2 resolved on the east run, row3 unresolved',
    pr.map((r) => `${r._rowStatus}:${r._resolvedVoyage?.voyageNumber || '-'}`).join(' '),
    pr.length === 3 && pr[0]._resolvedVoyage?.voyageNumber === E1.voyageNumber && pr[1]._resolvedVoyage?.voyageNumber === E1.voyageNumber && pr[2]._rowStatus !== 'valid');

  // FL-02: the client echoes forged resolutions
  const forged = row();
  forged._resolvedVoyage = { _id: id(W1), polId: { _id: id(P4) }, podId: { _id: id(P1) } };
  forged._resolvedPol = { _id: id(P4) }; forged._resolvedPod = { _id: id(P1) }; forged._resolvedCt = { _id: id(CT) }; forged._rowStatus = 'valid';
  const f2 = await imp([forged]);
  const f2b = list(await admin.get(`/bookings?search=${forged.containerNumber}`))[0];
  if (f2b) created.push(f2b._id);
  probe('FL-02', 'Import save with forged _resolved* ids and a forced valid status', 'server re-resolves: booking is P1 -> P4 on the east run',
    `${f2.status} voyage=${f2b?.voyageId?.voyageNumber} pol=${id(f2b?.polId) === id(P1) ? 'P1' : id(f2b?.polId)}`, f2.status === 201 && f2b?.voyageId?.voyageNumber === E1.voyageNumber && id(f2b.polId) === id(P1) && id(f2b.podId) === id(P4));
  const dead = row({ pol: P1.name, pod: P5.name });
  const f2c = await imp([dead]);
  probe('FL-02b', 'Import save of a row no run can carry', 'nothing saved (400 / not created)', sum(f2c), f2c.status === 400 || (f2c.data?.created || []).length === 0);

  // FL-03: bookings that must not be overwritten
  const keep = await mkBk(admin, { freightRate: 111 });
  await admin.put(`/bookings/${keep.data._id}`, { status: 'Final Loading' });
  const f3 = await imp([row({ containerNumber: keep.data.containerNumber, rate: '999' })]);
  const keepNow = await admin.get(`/bookings/${keep.data._id}`);
  probe('FL-03', 'Import "update" of a Final Loading booking', 'refused, rate unchanged (111)', `${sum(f3)} rate=${keepNow.data?.freightRate} status=${keepNow.data?.status}`, keepNow.data?.freightRate === 111 && keepNow.data?.status === 'Final Loading');
  const upd = await mkBk(admin, { freightRate: 70 });
  const f3b = await imp([row({ containerNumber: upd.data.containerNumber, rate: '75', pol: P2.name, pod: P3.name })]);
  const updNow = await admin.get(`/bookings/${upd.data._id}`);
  probe('FL-03b', 'Import "update" of a Pending booking still works and re-routes it', 'rate 75, P2 -> P3', `${f3b.status} rate=${updNow.data?.freightRate} pol=${id(updNow.data?.polId) === id(P2)} pod=${id(updNow.data?.podId) === id(P3)}`,
    f3b.status === 201 && updNow.data?.freightRate === 75 && id(updNow.data.polId) === id(P2) && id(updNow.data.podId) === id(P3));

  // FL-04: Final Loading is a manifest
  const victim = await mkBk(admin, { containerNumber: box() }); // live, not in the file
  const good = row();
  const badRow = row({ pol: P1.name, pod: P5.name });
  const f4 = await imp([good, badRow], 'finalLoading');
  const victimNow = await admin.get(`/bookings/${victim.data._id}`);
  probe('FL-04', 'Final Loading file with one row that cannot be saved', 'whole file refused; no booking cancelled', `${sum(f4)} victim=${victimNow.data?.status}`, f4.status === 400 && victimNow.data?.status === 'Pending');
  const f4b = await imp([good], 'finalLoading');
  const goodNow = list(await admin.get(`/bookings?search=${good.containerNumber}`))[0];
  if (goodNow) created.push(goodNow._id);
  const victimAfter = await admin.get(`/bookings/${victim.data._id}`);
  probe('FL-04b', 'Valid Final Loading file', 'file container Final Loading; missing live bookings (Pending and Final Loading) Cancelled', `${f4b.status} good=${goodNow?.status} victim=${victimAfter.data?.status} unlisted-FL=${(await admin.get(`/bookings/${keep.data._id}`)).data?.status}`,
    f4b.status === 201 && goodNow?.status === 'Final Loading' && victimAfter.data?.status === 'Cancelled');

  // ── 4. discharge list and scope ─────────────────────────────────────────────
  console.log('\n[4] Discharge list by POL -> POD');
  const fl = async (over) => { const b = await mkBk(admin, over); await admin.put(`/bookings/${b.data._id}`, { status: 'Final Loading' }); return b.data; };
  const d1 = await fl({ polId: id(P1), podId: id(P4) });
  const d2 = await fl({ polId: id(P1), podId: id(P3) });
  const dl = list(await admin.get(`/bookings/discharge-list?roundId=${RID}&polId=${id(P1)}&podId=${id(P3)}`));
  probe('DS-01', 'Discharge list P1 -> P3', 'only Final Loading bookings P1 -> P3', `${dl.map((b) => b.containerNumber).join(',')}`, dl.length >= 1 && dl.every((b) => b.status === 'Final Loading' && id(b.polId) === id(P1) && id(b.podId) === id(P3)) && dl.some((b) => b._id === d2._id) && !dl.some((b) => b._id === d1._id));
  const x = await admin.get(`/bookings/export/discharge-list?roundId=${RID}&polId=${id(P1)}&podId=${id(P3)}`, true);
  probe('DS-02', 'Excel export of the same list', '200 xlsx', `${x.status} ${x.type} ${x.bytes}b`, x.status === 200 && /spreadsheetml/.test(x.type) && x.bytes > 1000);
  const x2 = await admin.get(`/bookings/export/discharge-list?roundId=${RID}&polId=${id(P4)}&podId=${id(P1)}`, true);
  probe('DS-03', 'Export of a pair with no Final Loading bookings', '404', String(x2.status), x2.status === 404);
  const ds = await admin.post('/bookings/import/save', { rows: [{ containerNumber: d2.containerNumber, pol: P1.name, pod: P3.name }], agentId: id(AG), roundId: RID, polId: id(P1), podId: id(P3), importType: 'discharge' });
  const d1Now = await admin.get(`/bookings/${d1._id}`); const d2Now = await admin.get(`/bookings/${d2._id}`);
  probe('DS-04', 'Discharge at P3: the P1 -> P4 booking is neither Discharged nor Remaining', 'd2 Discharged, d1 untouched (null)', `${sum(ds)} d2=${d2Now.data?.dischargeStatus} d1=${d1Now.data?.dischargeStatus}`, ds.status === 201 && d2Now.data?.dischargeStatus === 'Discharged' && !d1Now.data?.dischargeStatus);
  const d3 = await fl({ polId: id(P1), podId: id(P3) });
  const ds2 = await admin.post('/bookings/import/save', { rows: [{ containerNumber: d2.containerNumber }], agentId: id(AG), roundId: RID, polId: id(P1), podId: id(P3), importType: 'discharge' });
  const d3Now = await admin.get(`/bookings/${d3._id}`);
  probe('DS-05', 'A Final Loading booking of the same scope missing from the file', 'Remaining', `${sum(ds2)} d3=${d3Now.data?.dischargeStatus}`, d3Now.data?.dischargeStatus === 'Remaining');

  // ── 5. partner label and partner user ───────────────────────────────────────
  console.log('\n[5] Partner label, partner user');
  const mkPartner = async (n) => { const r = await admin.post('/partners', { code: `ZBP${RUN}${n}`, name: `ZB Probe Partner ${n} ${RUN}`, baseCurrency: 'USD' }); if (r.status === 201) cleanup.push(() => admin.del(`/partners/${r.data._id}`)); return r; };
  const pA = await mkPartner('A'); const pB = await mkPartner('B');
  if (pA.status !== 201 || pB.status !== 201) throw new Error('partner fixture: ' + sum(pA) + sum(pB));
  const lab = await mkBk(admin, { partnerId: id(pA.data) });
  probe('PT-01', 'Staff labels a booking with a partner', '201, partner shown, source Staff', `${sum(lab)} partner=${lab.data?.partnerId?.code} source=${lab.data?.source}`, lab.status === 201 && id(lab.data.partnerId) === id(pA.data) && lab.data.source === 'Staff');
  const del = await admin.del(`/partners/${id(pA.data)}`);
  probe('PT-02', 'Deleting a partner that has labelled bookings', 'refused (dependents)', sum(del), del.status !== 200);

  const role = await admin.post('/roles', { name: `ZB Partner Role ${RUN}`, isPartnerRole: true });
  if (role.status !== 201) throw new Error('role fixture: ' + sum(role));
  cleanup.push(() => admin.del(`/roles/${role.data._id}`));
  const full = { create: true, read: true, update: true, delete: true, import: true, export: true };
  await admin.put(`/permissions/${role.data._id}`, { permissions: [{ module: 'bookings', actions: full }, { module: 'agents', actions: full }, { module: 'reports', actions: full }, { module: 'invoices', actions: full }] });
  const noPartnerUser = await admin.post('/users', { name: 'ZB NoPartner', email: `zb.np.${RUN.toLowerCase()}@probe.test`, password: 'Probe@12345', roleId: role.data._id });
  probe('PT-03', 'A user of a partner role without a partner', '400', sum(noPartnerUser), noPartnerUser.status === 400);
  const email = `zb.${RUN.toLowerCase()}@probe.test`;
  const usr = await admin.post('/users', { name: 'ZB Partner User', email, password: 'Probe@12345', roleId: role.data._id, partnerId: id(pA.data) });
  if (usr.status !== 201) throw new Error('user fixture: ' + sum(usr));
  cleanup.unshift(() => admin.del(`/users/${usr.data._id}`));
  const roleFlip = await admin.put(`/roles/${role.data._id}`, { name: role.data.name, isPartnerRole: false });
  probe('PT-04', 'Turning off the partner flag while a user holds the role', '400', sum(roleFlip), roleFlip.status === 400);

  const pu = await new Client().login(email, 'Probe@12345');
  const own = await mkBk(pu, { status: 'Confirmed', partnerId: id(pB.data) });
  probe('PT-05', 'Partner user creates a booking and tries to set another partner and status Confirmed', '201, own partner, source PartnerUser, Pending', `${sum(own)} partner=${own.data?.partnerId?.code} source=${own.data?.source} status=${own.data?.status}`,
    own.status === 201 && id(own.data.partnerId) === id(pA.data) && own.data.source === 'PartnerUser' && own.data.status === 'Pending');
  const pl = list(await pu.get('/bookings?limit=100'));
  probe('PT-06', 'Partner user lists bookings', 'only their partner\'s', `${pl.length} rows, foreign=${pl.filter((b) => id(b.partnerId) !== id(pA.data)).length}`, pl.length >= 2 && pl.every((b) => id(b.partnerId) === id(pA.data)));
  const peek = await pu.get(`/bookings/${a1.data._id}`);
  probe('PT-07', 'Partner user opens another booking (unlabelled)', '404', String(peek.status), peek.status === 404);
  const setStatus = await pu.put(`/bookings/${own.data._id}`, { status: 'Confirmed' });
  probe('PT-08', 'Partner user changes the status', '403', sum(setStatus), setStatus.status === 403);
  const hijack = await pu.put(`/bookings/${own.data._id}`, { partnerId: id(pB.data), freightRate: 222 });
  const hijackNow = await admin.get(`/bookings/${own.data._id}`);
  probe('PT-09', 'Partner user tries to re-label a booking', 'label unchanged', `${hijack.status} partner=${hijackNow.data?.partnerId?.code}`, id(hijackNow.data?.partnerId) === id(pA.data));
  const cross = await Promise.all(['/agents', '/reports/revenue', '/invoices', '/users', '/dashboard/stats', '/ledger/account-lookup?rule=revenue'].map((u) => pu.get(u)));
  probe('PT-10', 'Partner user on agents, reports, invoices, users, dashboard, ledger account-lookup (BK-01)', 'all 403', cross.map((r) => r.status).join(','), cross.every((r) => r.status === 403));
  const lk = await pu.get(`/bookings/lookups?roundId=${RID}`);
  probe('PT-11', 'Partner user gets the booking pick-lists', '200 agents, rounds, container types, ports (no bank data)', `${lk.status} agents=${lk.data?.agents?.length} ports=${lk.data?.ports?.length} bank=${JSON.stringify(lk.data?.agents?.[0] || {}).includes('bank')}`,
    lk.status === 200 && lk.data.agents.length > 0 && lk.data.ports.length === 4 && !JSON.stringify(lk.data.agents[0]).includes('bank'));
  const exp = await pu.get(`/bookings/export/discharge-list?roundId=${RID}&polId=${id(P1)}&podId=${id(P3)}`, true);
  const dlp = await pu.get(`/bookings/discharge-list?roundId=${RID}&polId=${id(P1)}&podId=${id(P3)}`);
  probe('PT-12', 'Partner user on the discharge list and export', '403 / 403', `${dlp.status} / ${exp.status}`, dlp.status === 403 && exp.status === 403);
  const pf = await pu.post('/bookings/import/save', { rows: [{ containerNumber: box(), containerType: CT.code, containerStatus: 'Full', pol: P1.name, pod: P4.name, rate: '1' }], agentId: id(AG), roundId: RID, importType: 'finalLoading' });
  probe('PT-13', 'Partner user runs a Final Loading import', '403', sum(pf), pf.status === 403);
  const pi = await pu.post('/bookings/import/save', { rows: [{ containerNumber: box(), containerType: CT.code, containerStatus: 'Full', pol: P1.name, pod: P4.name, rate: '1' }], agentId: id(AG), roundId: RID, importType: 'booking' });
  const piB = list(await admin.get(`/bookings?roundId=${RID}&limit=200`)).filter((b) => b.source === 'PartnerUser' && b._id !== own.data._id);
  piB.forEach((b) => created.push(b._id));
  probe('PT-14', 'Partner user imports bookings', '201, rows labelled with their partner', `${sum(pi)} labelled=${piB.length ? id(piB[0].partnerId) === id(pA.data) : 'none'}`, pi.status === 201 && piB.length >= 1 && piB.every((b) => id(b.partnerId) === id(pA.data)));
  const myList = await pu.get(`/bookings?partnerId=${id(pB.data)}&limit=100`);
  probe('PT-15', 'Partner user filters by another partner', 'still only their own', `${list(myList).length} rows, foreign=${list(myList).filter((b) => id(b.partnerId) !== id(pA.data)).length}`, list(myList).every((b) => id(b.partnerId) === id(pA.data)));
  created.push(own.data._id);

  // ── cleanup ─────────────────────────────────────────────────────────────────
  const all = list(await admin.get(`/bookings?roundId=${RID}&limit=500`)).map((b) => b._id);
  for (const b of new Set([...created, ...all])) { try { await admin.del(`/bookings/${b}`); } catch { /* */ } }
  for (const fn of cleanup) { try { await fn(); } catch { /* best effort */ } }
  const bad = out.filter((o) => !o.ok);
  console.log(`\n${out.length} probes, ${bad.length} defects: ${bad.map((b) => b.key).join(', ')}`);
  require('fs').writeFileSync(require('path').join(__dirname, 'bookings-probe.result.json'), JSON.stringify(out, null, 2));
})().catch((e) => { console.error('probe aborted:', e); process.exit(2); });
