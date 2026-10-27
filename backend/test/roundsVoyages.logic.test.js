'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const L = require('../src/modules/routes/routeLegs.logic');
const V = require('../src/modules/voyages/voyage.logic');
const R = require('../src/modules/rounds/round.logic');

const id = (n) => String(n).padStart(24, '0');
const leg = (port, extra = {}) => ({ countryId: id(1), cityId: id(2), portId: id(port), ...extra });
const refuses = (fn, re) => assert.throws(fn, (e) => e.status === 400 && re.test(e.message));

// ── RV-08/09 ──────────────────────────────────────────────────────────────────
test('route: needs >= 2 legs and valid ids', () => {
  refuses(() => L.assertLegShape([leg(1)]), /at least 2/);
  refuses(() => L.assertLegShape([leg(1), { countryId: id(1), cityId: id(2) }]), /Leg 2/);
  refuses(() => L.assertLegShape([leg(1), leg(2, { terminalId: 'nope' })]), /terminalId/);
  L.assertLegShape([leg(1), leg(2, { terminalId: id(9), agentId: id(8) })]);
});

test('route: consecutive identical ports are refused, round trips are allowed', () => {
  refuses(() => L.assertNoConsecutivePorts([leg(1), leg(1), leg(2)]), /Legs 1 and 2/);
  refuses(() => L.assertNoConsecutivePorts([leg(1), leg(2), leg(2)]), /Legs 2 and 3/);
  L.assertNoConsecutivePorts([leg(1), leg(2), leg(3), leg(1)]);   // A-B-C-A
});

// ── RV-10/11/12 ───────────────────────────────────────────────────────────────
const maps = (over = {}) => ({
  countries: new Map([[id(1), { _id: id(1) }]]),
  cities:    new Map([[id(2), { _id: id(2), countryId: id(1) }]]),
  ports:     new Map([[id(3), { _id: id(3), cityId: id(2), countryId: id(1) }], [id(4), { _id: id(4), cityId: id(5), countryId: id(1) }]]),
  terminals: new Map([[id(6), { _id: id(6), portId: id(3) }]]),
  agents:    new Map([[id(7), { _id: id(7) }]]),
  ...over,
});

test('route: references must exist and belong together', () => {
  const ok = [leg(3, { terminalId: id(6), agentId: id(7) }), leg(3)];
  L.checkLegReferences(ok, maps());
  refuses(() => L.checkLegReferences([leg(99)], maps()), /port does not exist/);
  refuses(() => L.checkLegReferences([leg(4)], maps()), /port does not belong to the selected city/);
  refuses(() => L.checkLegReferences([{ ...leg(3), countryId: id(77) }], maps()), /country does not exist/);
  refuses(() => L.checkLegReferences([leg(3, { terminalId: id(66) })], maps()), /terminal does not exist/);
  refuses(() => L.checkLegReferences([leg(3, { terminalId: id(6) })], maps({ terminals: new Map([[id(6), { portId: id(4) }]]) })), /terminal does not belong/);
  refuses(() => L.checkLegReferences([leg(3, { agentId: id(70) })], maps()), /agent does not exist/);
});

test('route: collectRefIds dedupes', () => {
  const r = L.collectRefIds([leg(3), leg(3), leg(4, { agentId: id(7) })]);
  assert.equal(r.ports.length, 2);
  assert.deepEqual(r.agents, [id(7)]);
  assert.deepEqual(r.terminals, []);
});

// ── RV-04/05 ──────────────────────────────────────────────────────────────────
test('round: only Planned or Active are valid initial statuses', () => {
  assert.equal(R.assertInitialStatus(undefined), 'Planned');
  assert.equal(R.assertInitialStatus('Active'), 'Active');
  refuses(() => R.assertInitialStatus('Completed'), /can only start as/);
  refuses(() => R.assertInitialStatus('Cancelled'), /can only start as/);
});

// ── RV-13/14 ──────────────────────────────────────────────────────────────────
test('round: route snapshot keeps ordered legs with stable ids and port details', () => {
  const snap = R.buildRouteSnapshot(id(50), [
    { sequence: 2, countryId: id(1), cityId: id(2), portId: { _id: id(4), name: 'Jeddah', code: 'SAJED' } },
    { sequence: 1, countryId: id(1), cityId: id(2), portId: { _id: id(3), name: 'Jebel Ali', code: 'AEJEA' }, agentId: id(7) },
  ], new Date('2026-10-26T00:00:00Z'));
  assert.deepEqual(snap.legs.map((l) => l.sequence), [1, 2]);
  assert.equal(snap.legs[0].portId, id(3));
  assert.equal(snap.legs[0].portName, 'Jebel Ali');
  assert.equal(snap.legs[0].agentId, id(7));
  assert.equal(snap.legs[1].terminalId, null);
  assert.equal(snap.routeId, id(50));
});

// ── RV-18/19/20 ───────────────────────────────────────────────────────────────
test('voyage: ETA before ETD and ATA before ATD are refused', () => {
  refuses(() => V.validateVoyageState({ etd: '2030-01-10', eta: '2030-01-05', status: 'Scheduled' }), /ETA cannot be earlier/);
  refuses(() => V.validateVoyageState({ atd: '2030-01-10', ata: '2030-01-09', status: 'Scheduled' }), /ATA cannot be earlier/);
  V.validateVoyageState({ etd: '2030-01-10', eta: '2030-01-10', status: 'Scheduled' });
  V.validateVoyageState({ etd: null, eta: '2030-01-05', status: 'Scheduled' });   // drafts with partial dates are fine
});

test('voyage: Departed needs ATD and Arrived needs ATA only when the status changes', () => {
  refuses(() => V.validateVoyageState({ status: 'Departed' }, { statusChanged: true }), /ATD/);
  refuses(() => V.validateVoyageState({ atd: '2030-01-01', status: 'Arrived' }, { statusChanged: true }), /ATA/);
  V.validateVoyageState({ atd: '2030-01-01', status: 'Departed' }, { statusChanged: true });
  V.validateVoyageState({ status: 'Departed' }, { statusChanged: false });                       // legacy row, other field edited
});

test('voyage: schedule problems are warnings, not errors', () => {
  const round = { startDate: '2030-01-01', endDate: '2030-03-01' };
  assert.deepEqual(V.scheduleWarnings({ etd: '2030-01-05', eta: '2030-01-09' }, round, null), []);
  const out = V.scheduleWarnings({ etd: '2029-12-01', eta: '2030-04-01' }, round, null);
  assert.equal(out.length, 2);
  assert.match(out[0], /ETD is outside/);
  const seq = V.scheduleWarnings({ etd: '2030-01-10' }, round, { eta: '2030-01-25' });
  assert.deepEqual(seq, ['ETD is earlier than the previous voyage ETA']);
});

// ── RV-22 ─────────────────────────────────────────────────────────────────────
test('voyage: middle generated voyage cannot be deleted; last generated and manual can', () => {
  const sibs = [{ isManual: false, sequence: 1 }, { isManual: false, sequence: 3 }, { isManual: true, sequence: 4 }];
  assert.match(V.deleteBlockReason({ isManual: false, sequence: 2 }, sibs), /Cancel it instead/);
  assert.match(V.deleteBlockReason({ isManual: false, sequence: 1 }, sibs), /Cancel it instead/);
  assert.equal(V.deleteBlockReason({ isManual: false, sequence: 3 }, [{ isManual: false, sequence: 1 }, { isManual: true, sequence: 4 }]), null);
  assert.equal(V.deleteBlockReason({ isManual: true, sequence: 4 }, sibs), null);
});
