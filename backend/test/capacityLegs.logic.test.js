'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/modules/capacity/capacityLegs.logic');

const id = (n) => String(n).padStart(24, '0');
// east run over ports 1-2-3-4 (legs L1..L4)
const east = [1, 2, 3, 4].map((p) => ({ legKey: `L${p}`, portId: id(p), portName: `P${p}` }));
const ev = (polIdx, podIdx, teu, layer = 'l2', extra = {}) => ({ polIdx, podIdx, teu, layer, ...extra });

test('a booking is aboard on every segment between its POL and POD', () => {
  const r = C.voyageSegments(east, [ev(1, 3, 10)], 100); // P2 -> P4
  assert.deepEqual(r.segments.map((s) => s.onboardTEU), [0, 10, 10]);
  assert.equal(r.peakOnboard, 10);
  assert.equal(r.segments[1].loadedTEU, 10);          // loaded at P2
  assert.equal(r.segments[2].dischargedTEU, 10);       // discharged on arrival at P4
});

test('overlapping bookings add up only where they overlap; both layers count', () => {
  const r = C.voyageSegments(east, [ev(0, 2, 40, 'l2'), ev(1, 3, 30, 'l1')], 60);
  assert.deepEqual(r.segments.map((s) => s.onboardTEU), [40, 70, 30]);
  assert.deepEqual(r.segments.map((s) => s.remainingTEU), [20, -10, 30]);   // segment 2 is overbooked
  assert.deepEqual(r.segments.map((s) => s.layer1.onboardTEU), [0, 30, 30]);
  assert.deepEqual(r.segments.map((s) => s.layer2.onboardTEU), [40, 40, 0]);
  assert.equal(r.peakOnboard, 70);
  assert.equal(r.loadedL1, 30);
  assert.equal(r.loadedL2, 40);
});

test('cargo that is discharged frees the space for the next leg (the old chain never could)', () => {
  const r = C.voyageSegments(east, [ev(0, 1, 90), ev(1, 2, 90), ev(2, 3, 90)], 100);
  assert.deepEqual(r.segments.map((s) => s.onboardTEU), [90, 90, 90]);
  assert.equal(r.peakOnboard, 90);
});

test('a container the discharge import left aboard stays on every later segment', () => {
  const r = C.voyageSegments(east, [ev(0, 1, 5, 'l2', { stuckRemaining: true })], 100);
  assert.deepEqual(r.segments.map((s) => s.onboardTEU), [5, 5, 5]);
  assert.deepEqual(r.remainingOnboardAt, { 1: 5 });
  assert.equal(r.discharged, 0);
});

test('no capacity (null) gives no remaining / utilisation', () => {
  const r = C.voyageSegments(east, [ev(0, 1, 4)], null);
  assert.equal(r.segments[0].remainingTEU, null);
  assert.equal(r.segments[0].utilisationPct, null);
});

test('spanOf: stored leg keys win, ports decide otherwise, a mismatch is null', () => {
  assert.deepEqual(C.spanOf(east, { polId: id(2), podId: id(4), polLegKey: 'L2', podLegKey: 'L4' }), { polIdx: 1, podIdx: 3 });
  assert.deepEqual(C.spanOf(east, { polId: id(2), podId: id(4) }), { polIdx: 1, podIdx: 3 });                                  // old booking, no keys
  assert.deepEqual(C.spanOf(east, { polId: id(2), podId: id(4), polLegKey: 'GONE', podLegKey: 'L4' }), { polIdx: 1, podIdx: 3 }); // edited leg: ports decide
  assert.equal(C.spanOf(east, { polId: id(4), podId: id(2) }), null);                                                           // wrong direction for this run
});

test('westbound run: the same booking maps onto the reversed port order', () => {
  const west = [...east].reverse();
  assert.deepEqual(C.spanOf(west, { polId: id(3), podId: id(2) }), { polIdx: 1, podIdx: 2 });
});

test('previewSpan checks every segment between POL and POD and names the worst one', () => {
  const r = C.voyageSegments(east, [ev(0, 2, 40), ev(1, 3, 30)], 100);
  const row = { segments: r.segments, ports: r.ports };
  const fit = C.previewSpan(row, { polId: id(1), podId: id(2) }, 50, 100);       // only segment 0 (40 aboard)
  assert.equal(fit.canFit, true);
  assert.equal(fit.remainingAfter, 10);
  const tight = C.previewSpan(row, { polId: id(1), podId: id(4) }, 40, 100);      // whole run, worst = segment 1 (70 aboard)
  assert.equal(tight.canFit, false);
  assert.equal(tight.worst.index, 1);
  assert.equal(tight.remainingAfter, -10);
  const whole = C.previewSpan(row, {}, 30, 100);                                  // no ports = whole run, exactly full
  assert.equal(whole.canFit, true);
  assert.equal(whole.remainingAfter, 0);
  assert.equal(C.previewSpan(row, { polId: id(4), podId: id(1) }, 1, 100), null); // not on this run
});
