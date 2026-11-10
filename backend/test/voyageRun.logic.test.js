'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const V = require('../src/modules/voyages/voyageRun.logic');
const R = require('../src/modules/rounds/round.logic');

const id = (n) => String(n).padStart(24, '0');
const refuses = (fn, re) => assert.throws(fn, (e) => e.status === 400 && re.test(e.message));

// Round legs: 1 Shanghai, 2 Singapore, 3 Jebel Ali, 4 Jeddah
const legs = [
  { sequence: 1, legKey: 'k1', portId: id(1), portName: 'Shanghai', portCode: 'CNSHA' },
  { sequence: 2, legKey: 'k2', portId: id(2), portName: 'Singapore', portCode: 'SGSIN' },
  { sequence: 3, legKey: 'k3', portId: id(3), portName: 'Jebel Ali', portCode: 'AEJEA' },
  { sequence: 4, legKey: 'k4', portId: id(4), portName: 'Jeddah', portCode: 'SAJED' },
];

test('number: V + 4-digit counter + direction letter', () => {
  assert.equal(V.formatVoyageNumber('V0001', 'East'), 'V0001E');
  assert.equal(V.formatVoyageNumber('V0002', 'West'), 'V0002W');
  assert.equal(V.formatVoyageNumber('V0010', 'North'), 'V0010N');
  assert.equal(V.formatVoyageNumber('V0011', 'South'), 'V0011S');
  refuses(() => V.formatVoyageNumber('V0001', 'Up'), /Direction must be one of/);
});

test('run: leg 1 -> leg 4 calls at every leg in order', () => {
  const calls = V.buildPortCalls(legs, 'k1', 'k4');
  assert.deepEqual(calls.map((c) => c.legKey), ['k1', 'k2', 'k3', 'k4']);
  assert.equal(calls[0].portName, 'Shanghai');
  assert.equal(calls[3].portCode, 'SAJED');
  assert.equal(calls[0].eta, null);
});

test('run: reverse leg 4 -> leg 1 and partial ranges', () => {
  assert.deepEqual(V.buildPortCalls(legs, 'k4', 'k1').map((c) => c.legKey), ['k4', 'k3', 'k2', 'k1']);
  assert.deepEqual(V.buildPortCalls(legs, 'k2', 'k3').map((c) => c.legKey), ['k2', 'k3']);
  assert.deepEqual(V.buildPortCalls(legs, 'k3', 'k1').map((c) => c.legKey), ['k3', 'k2', 'k1']);
});

test('run: unknown key, same leg and repeated consecutive port are refused', () => {
  refuses(() => V.buildPortCalls(legs, 'zz', 'k4'), /Start leg/);
  refuses(() => V.buildPortCalls(legs, 'k1', 'zz'), /End leg/);
  refuses(() => V.buildPortCalls(legs, 'k2', 'k2'), /must be different/);
  const dup = [legs[0], { ...legs[1], portId: id(1) }, legs[2]];
  refuses(() => V.buildPortCalls(dup, 'k1', 'k3'), /same port/);
});

test('run: a round trip route (port repeated, not consecutive) is allowed', () => {
  const loop = [legs[0], legs[1], { ...legs[2], legKey: 'k5', portId: id(1) }];
  assert.equal(V.buildPortCalls(loop, 'k1', 'k5').length, 3);
});

test('overlap: same direction + shared legs warns, opposite direction or cancelled does not', () => {
  const run = { direction: 'East', fromLegKey: 'k1', toLegKey: 'k4' };
  const others = [
    { voyageNumber: 'V0001E', direction: 'East', fromLegKey: 'k2', toLegKey: 'k3', status: 'Scheduled' },
    { voyageNumber: 'V0002W', direction: 'West', fromLegKey: 'k4', toLegKey: 'k1', status: 'Scheduled' },
    { voyageNumber: 'V0003E', direction: 'East', fromLegKey: 'k1', toLegKey: 'k4', status: 'Cancelled' },
  ];
  const w = V.overlapWarnings(legs, run, others);
  assert.equal(w.length, 1);
  assert.match(w[0], /V0001E/);
  assert.deepEqual(V.overlapWarnings(legs, run, []), []);
});

test('legs edit: removed legs and changed ports are reported for live voyages only', () => {
  const calls = V.buildPortCalls(legs, 'k1', 'k4');
  const voyages = [
    { voyageNumber: 'V0001E', status: 'Scheduled', portCalls: calls },
    { voyageNumber: 'V0002W', status: 'Cancelled', portCalls: calls },
  ];
  const edited = [legs[0], { ...legs[1], portId: id(9) }, legs[3]]; // k3 removed, k2 port changed
  const w = V.legsChangeWarnings(edited, voyages);
  assert.equal(w.length, 2);
  assert.ok(w.every((m) => m.includes('V0001E')));
  assert.deepEqual(V.legsChangeWarnings(legs, voyages), []);
});

test('port call dates: merged by legKey, arrival cannot be after departure, unknown key refused', () => {
  const calls = V.buildPortCalls(legs, 'k1', 'k3');
  const out = V.mergePortCallDates(calls, [{ legKey: 'k2', eta: '2030-01-05', etd: '2030-01-06' }]);
  assert.equal(out[1].eta.toISOString().slice(0, 10), '2030-01-05');
  assert.equal(out[0].eta, null);
  assert.equal(V.mergePortCallDates(calls, undefined), calls);
  refuses(() => V.mergePortCallDates(calls, [{ legKey: 'k2', eta: '2030-01-06', etd: '2030-01-05' }]), /departure cannot be earlier/);
  refuses(() => V.mergePortCallDates(calls, [{ legKey: 'k4', eta: '2030-01-06' }]), /not part of this voyage/);
});

test('round legs: keys are kept only when they already exist and are unique; new legs get fresh keys', () => {
  const ports = new Map([[id(1), { name: 'A', code: 'AAA' }], [id(2), { name: 'B', code: 'BBB' }]]);
  const sent = [
    { legKey: 'k1', countryId: id(7), cityId: id(8), portId: id(1) },
    { legKey: 'k1', countryId: id(7), cityId: id(8), portId: id(2) },   // repeated key
    { legKey: 'evil', countryId: id(7), cityId: id(8), portId: id(1) }, // unknown key
    { countryId: id(7), cityId: id(8), portId: id(2), terminalId: id(5) },
  ];
  const out = R.buildEditedLegs(sent, ['k1', 'k2'], ports);
  assert.deepEqual(out.map((l) => l.sequence), [1, 2, 3, 4]);
  assert.equal(out[0].legKey, 'k1');
  assert.notEqual(out[1].legKey, 'k1');
  assert.notEqual(out[2].legKey, 'evil');
  assert.equal(new Set(out.map((l) => l.legKey)).size, 4);
  assert.equal(out[0].portName, 'A');
  assert.equal(out[3].terminalId, id(5));
  assert.equal(out[0].terminalId, null);
});

test('round snapshot: every leg gets a legKey', () => {
  const snap = R.buildRouteSnapshot(id(50), [
    { sequence: 1, countryId: id(1), cityId: id(2), portId: { _id: id(3), name: 'X', code: 'X' } },
    { sequence: 2, countryId: id(1), cityId: id(2), portId: { _id: id(4), name: 'Y', code: 'Y' } },
  ]);
  assert.ok(snap.legs.every((l) => typeof l.legKey === 'string' && l.legKey.length >= 8));
  assert.notEqual(snap.legs[0].legKey, snap.legs[1].legKey);
});
