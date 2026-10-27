'use strict';
// Regression probe (was the audit probe): Service -> Route legs -> Round -> generated Voyages (up to the booking step).
// Runs against a RUNNING dev server on the disposable test DB. Prints OBSERVED behaviour next to the EXPECTED
// behaviour; a line marked DEFECT is a regression. Section 9 calls the services directly (own mongoose
// connection, same DB) to force failures an HTTP client cannot cause (transaction rollback paths).
//   node scripts/audit-probes/rounds-voyages-probe.js
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
  async req(method, url, body) {
    const headers = { Cookie: `token=${this.token}` };
    if (method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${BASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await r.json(); } catch { /* */ }
    return { status: r.status, data: json?.data, code: json?.code, message: json?.message, body: json };
  }
  get(u) { return this.req('GET', u); } post(u, b) { return this.req('POST', u, b ?? {}); }
  put(u, b) { return this.req('PUT', u, b); } del(u) { return this.req('DELETE', u); }
}
const list = (r) => (Array.isArray(r.data) ? r.data : []);
const id = (x) => String(x?._id || x);
// ok = the system behaved as it should. defect = it did not.
const probe = (key, title, expected, observed, ok) => {
  out.push({ key, title, expected, observed, ok });
  console.log(`${ok ? 'ok    ' : 'DEFECT'} ${key}  ${title}\n         expected: ${expected}\n         observed: ${observed}`);
};
const sum = (r) => `${r.status}${r.code ? ' ' + r.code : ''} ${r.message || ''}${r.body?.errors ? ' ' + JSON.stringify(r.body.errors) : ''}`.trim();
const cleanup = [];

(async () => {
  const admin = await new Client().login(process.env.ADMIN_EMAIL || 'admin@logistics.com', process.env.ADMIN_PASSWORD || 'Admin@123456');

  // ── fixtures ────────────────────────────────────────────────────────────────
  const ports = list(await admin.get('/locations/ports?limit=100')).filter((p) => !/^E2E/.test(p.name));
  if (ports.length < 5) throw new Error('need >= 5 seeded ports');
  const [P1, P2, P3, P4, P5] = ports;
  const leg = (p, extra = {}) => ({ countryId: id(p.countryId), cityId: id(p.cityId), portId: id(p), ...extra });
  const rev = list(await admin.get('/ledger/account-lookup?rule=revenue'))[0]._id;
  let n = 0;
  const mkVessel = async (extra = {}) => {
    n += 1;
    const r = await admin.post('/vessels', { vesselCode: `ZV${RUN}${n}`, vesselName: `E2E Probe Vessel ${RUN}${n}`, ownershipType: 'Owned', imoNumber: String(7000000 + Math.floor(Math.random() * 999999)), callSign: `ZC${n}`, capacity: 1000, defaultDailyHireRate: 100, ...extra });
    if (r.status !== 201) throw new Error('vessel fixture: ' + sum(r));
    cleanup.push(() => admin.del(`/vessels/${r.data._id}`)); return r.data;
  };
  const mkService = async (ports_, extra = {}) => {
    n += 1;
    const s = await admin.post('/services', { serviceCode: `ZS${RUN}${n}`, serviceName: `E2E Probe Service ${RUN}${n}`, revenueAccountId: rev, ...extra });
    if (s.status !== 201) throw new Error('service fixture: ' + sum(s));
    cleanup.push(() => admin.del(`/services/${s.data._id}`));
    let rt = null;
    if (ports_) { rt = await admin.put(`/services/${s.data._id}/route`, { legs: ports_.map((p) => (p.portId ? p : leg(p))) }); if (rt.status !== 200) throw new Error('route fixture: ' + sum(rt)); }
    return { svc: s.data, route: rt };
  };
  const mkRound = (svcId, vesselId, extra = {}) => admin.post('/rounds', { serviceId: svcId, vesselId, roundName: `E2E Probe Round ${RUN}`, startDate: '2030-01-01', endDate: '2030-03-01', ...extra });
  const trackRound = (r) => { if (r.status === 201) cleanup.unshift(() => admin.del(`/rounds/${r.data.round._id}`)); return r; };
  const voyagesOf = async (rid) => list(await admin.get(`/voyages?roundId=${rid}&limit=50`));

  // ── 1. Round creation: references ───────────────────────────────────────────
  console.log('\n[1] Round creation - what is validated');
  const A = await mkService([P1, P2, P3]);
  const v1 = await mkVessel();
  const badPlugs = await admin.post('/vessels', { vesselCode: 'ZR' + RUN, vesselName: 'E2E Probe Reefer ' + RUN, ownershipType: 'Owned', imoNumber: String(7900000 + Math.floor(Math.random() * 99999)), reeferPlugs: 1.5 });
  probe('RV-00', 'Vessel created without reeferPlugs (fixture) / with 1.5 plugs', '201 / 400', `created ${v1._id ? 'yes' : 'no'}; 1.5 -> ${badPlugs.status}`, !!v1._id && badPlugs.status === 400);
  const fakeVessel = '64b000000000000000000001';
  const r1 = trackRound(await mkRound(A.svc._id, fakeVessel));
  probe('RV-01', 'Round created with a vessel id that does not exist', '400 vessel not found', sum(r1), r1.status === 400);
  const inactiveSvc = await mkService([P1, P2], { status: 'Inactive' });
  const r1b = trackRound(await mkRound(inactiveSvc.svc._id, v1._id));
  const ghostUpd = await admin.put('/rounds/64b000000000000000000009', { vesselId: fakeVessel });
  probe('RV-01b', 'Round update on an unknown round / vessel', 'never 200', sum(ghostUpd), ghostUpd.status !== 200);
  probe('RV-02', 'Round created on an Inactive service', '400 service inactive', sum(r1b), r1b.status === 400);
  const vInactive = await mkVessel({ status: 'Inactive' });
  const r1c = trackRound(await mkRound(A.svc._id, vInactive._id));
  probe('RV-03', 'Round created on an Inactive vessel', '400 vessel inactive', sum(r1c), r1c.status === 400);
  const r1d = trackRound(await mkRound(A.svc._id, v1._id, { status: 'Completed' }));
  probe('RV-04', 'Round created directly as Completed (skips Planned->Active->Completed)', '400 / forced to Planned', sum(r1d) + ` status=${r1d.data?.round?.status}`, r1d.status === 400 || r1d.data?.round?.status === 'Planned');
  const r1e = trackRound(await mkRound(A.svc._id, v1._id, { status: 'Cancelled' }));
  probe('RV-05', 'Round created directly as Cancelled', '400 / forced to Planned', `status=${r1e.data?.round?.status}`, r1e.status === 400 || r1e.data?.round?.status === 'Planned');

  const v1a = await mkVessel();
  const r1f = trackRound(await mkRound(A.svc._id, v1a._id, { status: 'Active' }));
  const f1 = r1f.status === 201 ? (await voyagesOf(r1f.data.round._id))[0] : null;
  probe('RV-04b', 'Round created Active: first voyage cascades to Departed with an ATD', 'Departed + atd set', sum(r1f) + ` first=${f1?.status} atd=${f1?.atd}`, f1?.status === 'Departed' && !!f1?.atd);

  // ── 2. Vessel exclusivity ───────────────────────────────────────────────────
  console.log('\n[2] One vessel, one Active round');
  const v2 = await mkVessel();
  const ra = trackRound(await mkRound(A.svc._id, v2._id));
  const rb = trackRound(await mkRound(A.svc._id, v2._id, { startDate: '2030-01-05', endDate: '2030-02-05' }));
  probe('RV-06', 'Two Planned rounds on the same vessel with overlapping dates', 'allowed (planning) or warned', `${sum(ra)} / ${sum(rb)}`, true);
  const actA = await admin.put(`/rounds/${ra.data.round._id}`, { status: 'Active' });
  const actB = await admin.put(`/rounds/${rb.data.round._id}`, { status: 'Active' });
  probe('RV-07', 'Activating BOTH Planned rounds of one vessel', 'second activation refused (409 vessel already Active)', `first=${actA.status} second=${actB.status}`, actA.status === 200 && actB.status === 409);

  const v2b = await mkVessel();
  const rp1 = trackRound(await mkRound(A.svc._id, v2b._id)); const rp2 = trackRound(await mkRound(A.svc._id, v2b._id));
  const race = await Promise.all([admin.put(`/rounds/${rp1.data.round._id}`, { status: 'Active' }), admin.put(`/rounds/${rp2.data.round._id}`, { status: 'Active' })]);
  probe('RV-34', 'Two concurrent activations of Planned rounds of one vessel', 'exactly one 200, the other 409', race.map(sum).join(' | '), race.filter((x) => x.status === 200).length === 1 && race.some((x) => x.status === 409));

  // ── 3. Route legs ───────────────────────────────────────────────────────────
  console.log('\n[3] Route legs');
  const dup = await mkService([P1, P1, P2]).catch((e) => ({ err: e.message }));
  probe('RV-08', 'Route with the same port on two consecutive legs (P1,P1,P2)', '400 consecutive legs must differ', dup.err || 'saved', !!dup.err);
  if (dup.svc) {
    const v3 = await mkVessel();
    const rd = trackRound(await mkRound(dup.svc._id, v3._id));
    const vs = rd.status === 201 ? await voyagesOf(rd.data.round._id) : [];
    const bad = vs.find((v) => id(v.polId) === id(v.podId));
    probe('RV-09', 'Voyage generated with POL = POD from that route', 'no such voyage', bad ? `voyage ${bad.voyageNumber} ${bad.polId?.name} -> ${bad.podId?.name}` : 'none', !bad);
  }
  const L = await mkService([P1, P2]);
  const mismatch = await admin.put(`/services/${L.svc._id}/route`, { legs: [leg(P1), { countryId: id(P2.countryId), cityId: id(P3.cityId), portId: id(P2) }] });
  probe('RV-10', 'Leg whose city does not contain its port (city of P3 with port P2)', '400 port not in that city/country', sum(mismatch), mismatch.status === 400);
  const fakeLeg = await admin.put(`/services/${L.svc._id}/route`, { legs: [leg(P1), { countryId: id(P2.countryId), cityId: id(P2.cityId), portId: id(P2), terminalId: '64b000000000000000000002' }] });
  probe('RV-11', 'Leg with a terminal that does not exist / is not in the port', '400', sum(fakeLeg), fakeLeg.status === 400);
  const ghostLeg = await admin.put(`/services/${L.svc._id}/route`, { legs: [leg(P1), { countryId: id(P2.countryId), cityId: id(P2.cityId), portId: '64b000000000000000000003' }] });
  probe('RV-12', 'Leg pointing at a port id that does not exist', '400', sum(ghostLeg), ghostLeg.status === 400);

  // ── 4. Route edited after rounds exist ──────────────────────────────────────
  console.log('\n[4] Editing a route that already generated voyages');
  const B = await mkService([P1, P2, P3]);
  const v4 = await mkVessel();
  const rp = trackRound(await mkRound(B.svc._id, v4._id));
  const before = await voyagesOf(rp.data.round._id);
  const edit = await admin.put(`/services/${B.svc._id}/route`, { legs: [leg(P3), leg(P4), leg(P5)] });
  const after = await voyagesOf(rp.data.round._id);
  const same = before.length === after.length && before.every((v, i) => id(v._id) === id(after[i]._id) && id(v.polId) === id(after[i].polId) && id(v.podId) === id(after[i].podId));
  const snapRound = (await admin.get(`/rounds/${rp.data.round._id}`)).data;
  const snapPorts = (snapRound?.routeSnapshot?.legs || []).map((l) => id(l.portId)).join(',');
  probe('RV-13', 'Route replaced under a Planned round: the round keeps its own route snapshot, voyages untouched', 'route save 200, snapshot = old route, voyages unchanged',
    `route save ${edit.status}; snapshot ${(snapRound?.routeSnapshot?.legs || []).map((l) => l.portName).join('>')}; voyages unchanged=${same}`, edit.status === 200 && same && snapPorts === [P1, P2, P3].map(id).join(','));
  const rports = await admin.get(`/voyages/round-ports/${rp.data.round._id}`);
  probe('RV-14', 'Manual-voyage port list for that round after the route change', 'ports of the ORIGINAL route', `shows ${list(rports).map((p) => p.name).join(', ')}`, list(rports).map((p) => id(p.portId)).join(',') === [P1, P2, P3].map(id).join(','));
  await admin.put(`/rounds/${rp.data.round._id}`, { status: 'Active' });
  const lockEdit = await admin.put(`/services/${B.svc._id}/route`, { legs: [leg(P1), leg(P2)] });
  probe('RV-15', 'Route edit while a round of the service is Active', '400 refused', sum(lockEdit), lockEdit.status === 400);

  // ── 5. Voyage editing ───────────────────────────────────────────────────────
  console.log('\n[5] Voyage dates and status');
  const C = await mkService([P1, P2, P3, P4]);
  const v5 = await mkVessel();
  const rc = trackRound(await mkRound(C.svc._id, v5._id));
  const cv = await voyagesOf(rc.data.round._id);
  probe('RV-16', 'Generated voyages count and chain (N legs -> N-1 voyages, POD(n)=POL(n+1))', '3 voyages, chained', `${cv.length}: ${cv.map((v) => `${v.polId?.name}>${v.podId?.name}`).join(' | ')}`,
    cv.length === 3 && cv.every((v, i) => i === 0 || id(v.polId) === id(cv[i - 1].podId)));
  probe('RV-17', 'Generated voyages carry ETD/ETA derived from the round window', 'DEFERRED (design gap): generated voyages stay bare, no invented dates', `etd=${cv[0]?.etd} eta=${cv[0]?.eta} name=${cv[0]?.voyageName}`, !cv[0]?.etd);
  const badDates = await admin.put(`/voyages/${cv[0]._id}`, { etd: '2031-06-01T00:00:00Z', eta: '2029-01-01T00:00:00Z' });
  probe('RV-18', 'ETA earlier than ETD (and both outside the round window 2030-01..03)', '400', sum(badDates), badDates.status === 400);
  const noAtd = await admin.put(`/voyages/${cv[0]._id}`, { status: 'Departed' });
  probe('RV-19', 'Status Departed with no ATD (actual departure) recorded', '400', sum(noAtd), noAtd.status === 400);
  const okDep = await admin.put(`/voyages/${cv[0]._id}`, { status: 'Departed', atd: '2030-01-02T00:00:00Z' });
  const arr = await admin.put(`/voyages/${cv[0]._id}`, { status: 'Arrived' });
  probe('RV-19b', 'Departed with ATD is accepted; Arrived without ATA is refused', '200 / 400', `${okDep.status} / ${arr.status}`, okDep.status === 200 && arr.status === 400);
  const ataBad = await admin.put(`/voyages/${cv[0]._id}`, { ata: '2030-01-01T00:00:00Z' });
  probe('RV-19c', 'ATA earlier than the STORED ATD (complete state validated, not just the patch)', '400', sum(ataBad), ataBad.status === 400);
  await admin.put(`/voyages/${cv[0]._id}`, { etd: '2030-01-20T00:00:00Z', eta: '2030-01-25T00:00:00Z' });
  const overlap = await admin.put(`/voyages/${cv[1]._id}`, { etd: '2030-01-10T00:00:00Z', eta: '2030-01-12T00:00:00Z' });
  probe('RV-20', 'Leg 2 sails (01-10) before leg 1 arrives (01-25)', 'saved with a warning (not blocked)', `leg2 save ${overlap.status} warnings=${JSON.stringify(overlap.data?.warnings)}`, overlap.status === 200 && (overlap.data?.warnings || []).some((w) => /previous voyage/.test(w)));
  const outside = await admin.put(`/voyages/${cv[2]._id}`, { etd: '2035-01-01T00:00:00Z', eta: '2035-01-05T00:00:00Z' });
  probe('RV-20b', 'Dates outside the round window', 'saved with a warning', `${outside.status} warnings=${JSON.stringify(outside.data?.warnings)}`, outside.status === 200 && (outside.data?.warnings || []).some((w) => /outside the round window/.test(w)));

  // ── 6. Manual voyages, deletes, cache ───────────────────────────────────────
  console.log('\n[6] Manual voyage, delete, capacity cache');
  const capBefore = await admin.get(`/capacity/round/${rc.data.round._id}`);
  const rowsBefore = (capBefore.data?.voyages || capBefore.data?.rows || []).length;
  const mv = await admin.post('/voyages', { roundId: rc.data.round._id, polId: id(P4), podId: id(P1), voyageName: 'E2E manual return' });
  const capAfter = await admin.get(`/capacity/round/${rc.data.round._id}`);
  const rowsAfter = (capAfter.data?.voyages || capAfter.data?.rows || []).length;
  probe('RV-21', 'Capacity result right after adding a manual voyage', `${rowsBefore + 1} rows (cache invalidated)`, `manual voyage ${mv.status}; rows ${rowsBefore} -> ${rowsAfter}`, rowsAfter === rowsBefore + 1);
  const rowsOf = async (rid) => { const c = await admin.get(`/capacity/round/${rid}`); return (c.data?.voyages || c.data?.rows || []).length; };
  const delMid = await admin.del(`/voyages/${cv[1]._id}`);
  probe('RV-22', 'Deleting a MIDDLE generated voyage (would break the POL/POD chain)', '400 cancel it instead', sum(delMid), delMid.status === 400 && /Cancel it instead/.test(delMid.message || ''));
  const mvNumber = mv.data?.voyageNumber;
  const rowsBeforeDel = await rowsOf(rc.data.round._id);
  const delManual = await admin.del(`/voyages/${mv.data?._id}`);
  const rowsAfterDel = await rowsOf(rc.data.round._id);
  probe('RV-23', 'Deleting a MANUAL voyage is allowed and capacity reflects it immediately (no TTL wait)', `200; ${rowsBeforeDel - 1} rows`, `${delManual.status}; rows ${rowsBeforeDel} -> ${rowsAfterDel}`, delManual.status === 200 && rowsAfterDel === rowsBeforeDel - 1);
  const mv2 = await admin.post('/voyages', { roundId: rc.data.round._id, polId: id(P4), podId: id(P1), voyageName: 'E2E manual return 2' });
  probe('RV-35', 'Voyage number of a deleted manual voyage is not handed out again', `new number != ${mvNumber}`, `${mv2.data?.voyageNumber}`, mv2.status === 201 && mv2.data?.voyageNumber !== mvNumber);
  const rowsBeforeLast = await rowsOf(rc.data.round._id);
  const delLast = await admin.del(`/voyages/${cv[2]._id}`);
  const rowsAfterLast = await rowsOf(rc.data.round._id);
  probe('RV-22b', 'Deleting the LAST generated voyage is allowed (capacity fresh)', `200; ${rowsBeforeLast - 1} rows`, `${delLast.status}; rows ${rowsBeforeLast} -> ${rowsAfterLast}`, delLast.status === 200 && rowsAfterLast === rowsBeforeLast - 1);
  const dupPorts = await admin.post('/voyages', { roundId: rc.data.round._id, polId: id(P1), podId: id(P2), voyageName: 'E2E dup leg' });
  probe('RV-24', 'Manual voyage repeating a leg that already exists in the round (P1>P2)', 'allowed (round trips) - informational', sum(dupPorts), true);

  // ── 7. Cancel / complete ────────────────────────────────────────────────────
  console.log('\n[7] Cancelling a round');
  const D = await mkService([P1, P2, P3]);
  const v6 = await mkVessel();
  const rx = trackRound(await mkRound(D.svc._id, v6._id));
  const cancel = await admin.put(`/rounds/${rx.data.round._id}`, { status: 'Cancelled' });
  const afterCancel = await voyagesOf(rx.data.round._id);
  probe('RV-25', 'Round cancelled: state of its voyages', 'voyages Cancelled too', `round ${cancel.data?.status}; voyages: ${afterCancel.map((v) => v.status).join(', ')}`, afterCancel.every((v) => v.status === 'Cancelled'));
  const ct = list(await admin.get('/container-types?limit=5'))[0]; const ag = list(await admin.get('/agents?limit=50')).find((a) => !/^E2/.test(a.agentName) && !((a.roles || []).length === 1 && a.roles[0] === 'Port'));
  const bk = await admin.post('/bookings/manual', { voyageId: afterCancel[0]._id, agentId: ag._id, cargoRows: [{ containerTypeId: ct._id, quantity: 1, rate: 100 }] });
  probe('RV-26', 'Booking (Layer 1) accepted on a voyage of a CANCELLED round', '400 round cancelled', sum(bk), bk.status === 400);
  // A voyage wrongly left Scheduled under a Cancelled round (voyages:override) must still be refused by the ROUND guard
  await admin.put(`/voyages/${afterCancel[0]._id}`, { status: 'Scheduled' });
  const bk26 = await admin.post('/bookings/manual', { voyageId: afterCancel[0]._id, agentId: ag._id, cargoRows: [{ containerTypeId: ct._id, quantity: 1, rate: 100 }] });
  const bk26b = await admin.post('/bookings', { voyageId: afterCancel[0]._id, agentId: ag._id, containerTypeId: ct._id, freightRate: 100, containerNumber: 'ZZZU' + RUN + '0' });
  probe('RV-26b', 'Voyage left Scheduled under a Cancelled round: Layer 1 and Layer 2 bookings refused by the round guard', '400 / 400 mentioning the round', `${sum(bk26)} | ${sum(bk26b)}`, bk26.status === 400 && bk26b.status === 400 && /round/i.test(bk26.message || '') && /round/i.test(bk26b.message || ''));
  const planned = trackRound(await mkRound(D.svc._id, v6._id, { startDate: '2031-01-01', endDate: '2031-02-01' }));
  const pv = await voyagesOf(planned.data.round._id);
  const bk2 = await admin.post('/bookings/manual', { voyageId: pv[0]._id, agentId: ag._id, cargoRows: [{ containerTypeId: ct._id, quantity: 1, rate: 100 }] });
  probe('RV-27', 'Booking accepted on a Planned round (advance booking)', 'allowed - informational', sum(bk2), bk2.status === 201);
  const cancelBlocked = await admin.put(`/rounds/${planned.data.round._id}`, { status: 'Cancelled' });
  const stillPlanned = (await admin.get(`/rounds/${planned.data.round._id}`)).data?.status;
  const pvAfter = await voyagesOf(planned.data.round._id);
  probe('RV-25b', 'Cancelling a round that has a live booking', '409, round stays Planned, voyages untouched', `${sum(cancelBlocked)}; round=${stillPlanned}; voyages=${pvAfter.map((v) => v.status).join(',')}`, cancelBlocked.status === 409 && stillPlanned === 'Planned' && pvAfter.every((v) => v.status === 'Scheduled'));
  if (bk2.data?._id) await admin.put(`/bookings/manual/${bk2.data._id}`, { status: 'Cancelled' });
  const cancelOk = await admin.put(`/rounds/${planned.data.round._id}`, { status: 'Cancelled' });
  const pvCancelled = await voyagesOf(planned.data.round._id);
  probe('RV-25c', 'Same round once the booking is Cancelled: cancel succeeds and voyages follow', '200, voyages Cancelled', `${cancelOk.status}; ${pvCancelled.map((v) => v.status).join(',')}`, cancelOk.status === 200 && pvCancelled.every((v) => v.status === 'Cancelled'));

  // ── 8. Deleting things the flow depends on ──────────────────────────────────
  console.log('\n[8] Delete guards along the chain');
  const E = await mkService([P1, P2]);
  const v7 = await mkVessel();
  const re = trackRound(await mkRound(E.svc._id, v7._id));
  await admin.put(`/rounds/${re.data.round._id}`, { status: 'Active' });
  await admin.put(`/rounds/${re.data.round._id}`, { status: 'Completed' });
  const delSvc = await admin.del(`/services/${E.svc._id}`);
  probe('RV-28', 'Service deleted while a COMPLETED round still references it', '409 has rounds', sum(delSvc), delSvc.status === 409);
  const orphan = await admin.get(`/rounds/${re.data.round._id}`);
  if (delSvc.status === 200) probe('RV-29', 'Round read after its service was deleted', 'service populated', `serviceId=${JSON.stringify(orphan.data?.serviceId)}`, !!orphan.data?.serviceId);
  const nAg = await admin.post('/agents', { agentCode: `ZA${RUN}`, agentName: `E2E Leg Agent ${RUN}`, nameAr: 'وكيل', defaultCurrency: 'usd', portId: id(P1), roles: ['Port'] });
  if (nAg.status !== 201) throw new Error('agent fixture: ' + sum(nAg));
  cleanup.push(() => admin.del(`/agents/${nAg.data?._id}`));
  const F = await mkService([P1, leg(P2, { agentId: nAg.data?._id })]);
  const delAg = await admin.del(`/agents/${nAg.data?._id}`);
  probe('RV-30', 'Agent deleted while it is the agent of a route leg', '409 has route legs', sum(delAg), delAg.status === 409 && /route legs/.test(delAg.message || ''));
  const { DEPENDENTS } = require('../../src/utils/dependents');
  probe('RV-30b', 'DEPENDENTS.agent covers Booking.agentId and RouteLeg.agentId', 'both listed', DEPENDENTS.agent.map((d) => d.model + '.' + d.field).join(', '), ['Booking.agentId', 'RouteLeg.agentId'].every((k) => DEPENDENTS.agent.some((d) => d.model + '.' + d.field === k)));
  const xp = await admin.post('/locations/ports', { name: `E2E Probe Port ${RUN}`, cityId: id(P1.cityId), countryId: id(P1.countryId) });
  const G = await mkService([{ countryId: id(P1.countryId), cityId: id(P1.cityId), portId: xp.data._id }, leg(P2)]);
  const v8 = await mkVessel();
  const rg = trackRound(await mkRound(G.svc._id, v8._id));
  await admin.put(`/services/${G.svc._id}/route`, { legs: [leg(P2), leg(P3)] }); // route no longer uses xp, voyages still do
  const delPort = await admin.del(`/locations/ports/${xp.data._id}`);
  probe('RV-31', 'Port deleted while generated voyages still use it as POL/POD', '409 used by voyages', sum(delPort), delPort.status === 409 && /voyages/.test(delPort.message || ''));
  const H = await mkService([P1, P2]);
  const delH = await admin.del(`/services/${H.svc._id}`);
  const routeGone = await admin.get(`/services/${H.svc._id}/route`);
  probe('RV-28c', 'Unused service deletes together with its Route and legs', '200, route lookup 404', `${delH.status}; route ${routeGone.status}`, delH.status === 200 && routeGone.status === 404);

  // ── 9. Forced failures: services called directly (transaction rollback paths) ──
  console.log('\n[9] Atomicity - forced failures');
  const mongoose = require('mongoose');
  await require('../../src/config/db')();
  // register every model, as the server does (hardDelete reaches PartnerTransfer etc. through mongoose.model)
  const walk = (d) => require('fs').readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(require('path').join(d, e.name)) : /\.model\.js$/.test(e.name) ? [require('path').join(d, e.name)] : []));
  walk(require('path').join(__dirname, '..', '..', 'src', 'modules')).forEach((f) => require(f));
  require('../../src/modules/partnerSettlement/partnerSettlement.models');
  const roundSvc = require('../../src/modules/rounds/round.service');
  const routeSvc = require('../../src/modules/routes/route.service');
  const Voyage = require('../../src/modules/voyages/voyage.model');
  const Round = require('../../src/modules/rounds/round.model');
  const RouteLeg = require('../../src/modules/routes/routeLeg.model');
  const idx = (await Round.collection.indexes()).find((i) => i.name === 'one_active_round_per_vessel');
  probe('RV-07c', 'Partial unique index one_active_round_per_vessel exists', 'present (npm run migrate:rounds-voyages)', idx ? JSON.stringify(idx.partialFilterExpression) : 'MISSING', !!idx);

  const S9 = await mkService([P1, P2, P3]); const v9 = await mkVessel();
  const roundsBefore = await Round.countDocuments({ serviceId: S9.svc._id });
  const origInsert = Voyage.insertMany; Voyage.insertMany = async () => { throw new Error('forced voyage insert failure'); };
  let err32 = null; try { await roundSvc.create({ serviceId: S9.svc._id, vesselId: v9._id, roundName: 'E2E rollback', startDate: '2030-01-01', endDate: '2030-03-01' }, null); } catch (e) { err32 = e; } finally { Voyage.insertMany = origInsert; }
  const roundsAfter = await Round.countDocuments({ serviceId: S9.svc._id });
  probe('RV-32', 'Round creation fails while inserting voyages', 'error surfaced; NO round left behind', `error=${err32?.message}; rounds ${roundsBefore} -> ${roundsAfter}`, !!err32 && roundsAfter === roundsBefore);

  const S10 = await mkService([P1, P2, P3]);
  const routeId = S10.route.data.route._id;
  const legsBefore = (await RouteLeg.find({ routeId }).sort({ sequence: 1 }).lean()).map((l) => id(l.portId)).join(',');
  const origIns = RouteLeg.insertMany; RouteLeg.insertMany = async () => { throw new Error('forced leg insert failure'); };
  let err33 = null; try { await routeSvc.saveLegs(S10.svc._id, [leg(P3), leg(P4), leg(P5)], null); } catch (e) { err33 = e; } finally { RouteLeg.insertMany = origIns; }
  const legsAfter = (await RouteLeg.find({ routeId }).sort({ sequence: 1 }).lean()).map((l) => id(l.portId)).join(',');
  probe('RV-33', 'Route replacement fails after the old legs were deleted', 'error surfaced; OLD legs still present', `error=${err33?.message}; legs unchanged=${legsBefore === legsAfter}`, !!err33 && legsBefore === legsAfter && legsAfter.length > 0);

  const S11 = await mkService([P1, P2]); const v11 = await mkVessel();
  const r11 = trackRound(await mkRound(S11.svc._id, v11._id));
  const PT = mongoose.model('PartnerTransfer'); const origDel = PT.deleteMany;
  PT.deleteMany = async () => { throw new Error('forced cleanup failure'); };
  let err37 = null; try { await roundSvc.hardDelete(r11.data.round._id); } catch (e) { err37 = e; } finally { PT.deleteMany = origDel; }
  const stillThere = !!(await Round.exists({ _id: r11.data.round._id })); const vLeft = await Voyage.countDocuments({ roundId: r11.data.round._id });
  probe('RV-37', 'Round delete whose cleanup fails', 'error surfaced; round AND voyages still present', `error=${err37?.message}; round=${stillThere} voyages=${vLeft}`, !!err37 && stillThere && vLeft === 1);
  await mongoose.disconnect();

  // ── cleanup ─────────────────────────────────────────────────────────────────
  for (const fn of cleanup) { try { await fn(); } catch { /* best effort */ } }
  const bad = out.filter((o) => !o.ok);
  console.log(`\n${out.length} probes, ${bad.length} defects: ${bad.map((b) => b.key).join(', ')}`);
  require('fs').writeFileSync(require('path').join(__dirname, 'rounds-voyages-probe.result.json'), JSON.stringify(out, null, 2));
})().catch((e) => { console.error('probe aborted:', e); process.exit(2); });
