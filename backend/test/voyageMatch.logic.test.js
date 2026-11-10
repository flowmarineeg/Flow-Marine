'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/modules/bookings/voyageMatch.logic');

const id = (n) => String(n).padStart(24, '0');
const call = (leg, port, etd = null) => ({ legKey: `L${leg}`, portId: id(port), etd });
// East run: ports 1-2-3-4 (legs 1..4). West run: 4-3-2-1.
const run = (num, status, ports, extra = {}) => ({ _id: id(num + 100), voyageNumber: `V${num}`, status, sequence: num, portCalls: ports, ...extra });
const east = (n = 1, status = 'Scheduled', extra) => run(n, status, [call(1, 1), call(2, 2), call(3, 3), call(4, 4)], extra);
const west = (n = 2, status = 'Scheduled', extra) => run(n, status, [call(4, 4), call(3, 3), call(2, 2), call(1, 1)], extra);

test('direction: going leg matches the east run, return leg the west run', () => {
  const vs = [east(1), west(2)];
  const go = M.findVoyageForBooking({ voyages: vs, polId: id(2), podId: id(3) });
  assert.equal(go.status, 'resolved');
  assert.equal(go.voyage.voyageNumber, 'V1');
  const back = M.findVoyageForBooking({ voyages: vs, polId: id(3), podId: id(2) });
  assert.equal(back.voyage.voyageNumber, 'V2');
});

test('intermediate ports are matched, leg keys returned', () => {
  const r = M.findVoyageForBooking({ voyages: [east(1)], polId: id(2), podId: id(4) });
  assert.equal(r.status, 'resolved');
  assert.equal(r.polLegKey, 'L2');
  assert.equal(r.podLegKey, 'L4');
});

test('no voyage covers the pair -> unresolved', () => {
  const r = M.findVoyageForBooking({ voyages: [east(1)], polId: id(4), podId: id(1) });
  assert.equal(r.status, 'unresolved');
  assert.equal(r.candidates.length, 0);
});

test('cancelled and completed voyages are never candidates', () => {
  const r = M.findVoyageForBooking({ voyages: [east(1, 'Cancelled'), east(2, 'Completed')], polId: id(1), podId: id(2) });
  assert.equal(r.status, 'unresolved');
});

test('same POL and POD is refused', () => {
  assert.throws(() => M.findVoyageForBooking({ voyages: [east(1)], polId: id(1), podId: id(1) }), (e) => e.status === 400);
  assert.throws(() => M.findVoyageForBooking({ voyages: [east(1)], polId: null, podId: id(1) }), (e) => e.status === 400);
});

test('repeated port: nearest POD after the POL, leg keys pin the exact call', () => {
  // ports A(1) B(2) C(3) A(1): leg 4 returns to port 1
  const v = run(1, 'Scheduled', [call(1, 1), call(2, 2), call(3, 3), call(4, 1)]);
  const a = M.findVoyageForBooking({ voyages: [v], polId: id(2), podId: id(1) });
  assert.equal(a.podLegKey, 'L4'); // B -> A can only be the last call
  const pinned = M.findVoyageForBooking({ voyages: [v], polId: id(1), podId: id(3), polLegKey: 'L1' });
  assert.equal(pinned.polLegKey, 'L1');
  assert.equal(M.findVoyageForBooking({ voyages: [v], polId: id(1), podId: id(3), polLegKey: 'L4' }).status, 'unresolved');
  // A -> B: the shortest span (leg 1 -> leg 2) wins
  const ab = M.findVoyageForBooking({ voyages: [v], polId: id(1), podId: id(2) });
  assert.equal(ab.polLegKey, 'L1');
  assert.equal(ab.podLegKey, 'L2');
});

test('several runs: not-yet-departed beats departed, a strict best is auto-picked', () => {
  const gone = east(1, 'Departed', { atd: '2026-01-01' });
  const next = east(2, 'Scheduled', { etd: '2027-01-01' });
  const r = M.findVoyageForBooking({ voyages: [gone, next], polId: id(1), podId: id(3), now: Date.parse('2026-06-01') });
  assert.equal(r.status, 'resolved');
  assert.equal(r.ranked, true);
  assert.equal(r.voyage.voyageNumber, 'V2');
  assert.equal(r.candidates.length, 2);
});

test('several runs: earliest departure from POL wins', () => {
  const late = east(1, 'Scheduled', { portCalls: [call(1, 1, '2027-03-01'), call(2, 2), call(3, 3)] });
  const early = east(2, 'Scheduled', { portCalls: [call(1, 1, '2027-02-01'), call(2, 2), call(3, 3)] });
  const r = M.findVoyageForBooking({ voyages: [late, early], polId: id(1), podId: id(3), now: Date.parse('2026-06-01') });
  assert.equal(r.voyage.voyageNumber, 'V2');
});

test('several runs with no usable difference stay ambiguous', () => {
  const r = M.findVoyageForBooking({ voyages: [east(1), east(2)], polId: id(1), podId: id(3) });
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.voyage, null);
  assert.equal(r.candidates.length, 2);
});

test('chosen voyage must be one of the candidates', () => {
  const vs = [east(1), east(2), west(3)];
  const ok = M.checkChosenVoyage({ voyages: vs, voyageId: id(102), polId: id(1), podId: id(3) });
  assert.equal(ok.status, 'resolved');
  assert.equal(ok.manual, true);
  assert.equal(ok.voyage.voyageNumber, 'V2');
  const wrongDirection = M.checkChosenVoyage({ voyages: vs, voyageId: id(103), polId: id(1), podId: id(3) });
  assert.equal(wrongDirection.status, 'unresolved');
  assert.equal(wrongDirection.overrideInvalid, true);
});
