'use strict';

// Voyage Details sprint C: Layer 1 `kind` (Estimate / Allocation), old documents without a kind, the "of which allocation"
// numbers, and the fixed-voyage presets rules of the booking forms (frontend/src/utils/voyagePortChoices.js, pure).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const K = require('../src/modules/bookings/kind.logic');
const S = require('../src/modules/bookings/bookingSummary.logic');
const L = require('../src/modules/voyages/voyageSummary.logic');
const M = require('../src/modules/bookings/voyageMatch.logic');

const by = (p = 0, c = 0, f = 0, x = 0, frP = 0, frC = 0, frF = 0, frX = 0, teuP = 0, teuC = 0, teuF = 0, teuX = 0) => ({
  Pending: { bookings: p, freight: frP, teu: teuP },
  Confirmed: { bookings: c, freight: frC, teu: teuC },
  'Final Loading': { bookings: f, freight: frF, teu: teuF },
  Cancelled: { bookings: x, freight: frX, teu: teuX },
});

// ── kind on old documents ────────────────────────────────────────────────────
test('kind: a document without kind (an old estimate) reads as Estimate; an unknown value too', () => {
  assert.equal(K.kindOf({}), 'Estimate');
  assert.equal(K.kindOf({ kind: undefined }), 'Estimate');
  assert.equal(K.kindOf({ kind: null }), 'Estimate');
  assert.equal(K.kindOf({ kind: 'Estimate' }), 'Estimate');
  assert.equal(K.kindOf({ kind: 'Allocation' }), 'Allocation');
  assert.equal(K.kindOf({ kind: 'weird' }), 'Estimate');
  assert.equal(K.kindOf(null), 'Estimate');
});

test('kind: withKind adds the read-time default and never changes an allocation', () => {
  const old = { bookingNumber: 'MB-000001' };
  assert.equal(K.withKind(old).kind, 'Estimate');
  assert.equal(K.withKind({ kind: 'Allocation' }).kind, 'Allocation');
  assert.equal(K.withKind(null), null);
});

test('kind: the Estimate filter is "kind != Allocation" (so old documents match), never "kind == Estimate"', () => {
  assert.deepEqual(K.kindFilter('Estimate'), { kind: { $ne: 'Allocation' } });
  assert.deepEqual(K.kindFilter('Allocation'), { kind: 'Allocation' });
  assert.equal(K.kindFilter(''), null);
  assert.equal(K.kindFilter(undefined), null);
  assert.throws(() => K.kindFilter('Forecast'), (e) => e.status === 400);
  // apply the fragments to old / new documents the way Mongo would
  const docs = [{ id: 1 }, { id: 2, kind: 'Estimate' }, { id: 3, kind: 'Allocation' }];
  const matches = (f, d) => (f.kind?.$ne !== undefined ? d.kind !== f.kind.$ne : d.kind === f.kind);
  assert.deepEqual(docs.filter((d) => matches(K.kindFilter('Estimate'), d)).map((d) => d.id), [1, 2]);
  assert.deepEqual(docs.filter((d) => matches(K.kindFilter('Allocation'), d)).map((d) => d.id), [3]);
});

test('kind: create defaults to Estimate, accepts Allocation, refuses an unknown kind; partner users always create estimates', () => {
  assert.equal(K.kindForCreate(undefined), 'Estimate');
  assert.equal(K.kindForCreate(''), 'Estimate');
  assert.equal(K.kindForCreate('Allocation'), 'Allocation');
  assert.throws(() => K.kindForCreate('Quota'), (e) => e.status === 400);
  assert.equal(K.kindForCreate('Allocation', { isPartnerUser: true }), 'Estimate');
});

// ── allocation counted inside Estimated, shown as "of which" ─────────────────
test('allocation: it is PART of Estimated, so the booking total never changes and the line is shown separately', () => {
  const est = by(3, 2, 0, 1);            // 6 estimates incl. 2 allocations (Pending 1, Confirmed 1)
  const alloc = by(1, 1, 0, 0);
  const without = L.bookingsCard(est, by());
  const withA = L.bookingsCard(est, by(), alloc);
  assert.equal(withA.total, without.total);
  assert.equal(withA.estimated.total, 6);
  assert.equal(withA.estimated.ofWhichAllocation, 2);
  assert.equal(without.estimated.ofWhichAllocation, 0); // no allocation data: zero, never undefined
});

test('allocation: of-which TEU and revenue count live statuses only (Cancelled excluded) and never exceed Estimated', () => {
  const est = by(0, 0, 0, 0, 100, 200, 0, 50, 4, 6, 0, 2);   // Pending 4 TEU, Confirmed 6, Cancelled 2
  const alloc = by(0, 0, 0, 0, 100, 0, 0, 50, 4, 0, 0, 2);   // Pending alloc 4 TEU + a Cancelled one
  const row = { layer1: { loadedTEU: 10 }, layer2: { loadedTEU: 0 } }; // capacity engine: live estimated TEU = 10
  const teu = L.teuCard(est, by(), row, alloc);
  assert.equal(teu.estimated, 10);              // still the capacity engine number, allocation is not added on top
  assert.equal(teu.ofWhichAllocation, 4);       // Cancelled 2 not counted
  const capped = L.teuCard(est, by(), { layer1: { loadedTEU: 3 }, layer2: { loadedTEU: 0 } }, alloc);
  assert.equal(capped.ofWhichAllocation, 3);    // never above Estimated
  const rev = L.revenueCard(est, by(), null, alloc);
  assert.equal(rev.estimated, 300);             // 100 + 200, Cancelled 50 excluded
  assert.equal(rev.ofWhichAllocation, 100);
  assert.equal(L.revenueCard(est, by(), null).ofWhichAllocation, 0);
});

test('allocation: per-status grouping of Layer 1 rows (summariseByStatus) is the same code path for allocations', () => {
  const out = S.summariseByStatus([{ _id: 'Pending', bookings: 2, totalFreight: 10, totalTEU: 4 }, { _id: 'Cancelled', bookings: 1, totalFreight: 5, totalTEU: 2 }], 1);
  assert.deepEqual(Object.keys(out), ['Pending', 'Confirmed', 'Final Loading', 'Cancelled']);
  assert.equal(out.Pending.teu, 4);
  assert.equal(out.Confirmed.bookings, 0);
});

// ── presets (fixed-voyage mode) ───────────────────────────────────────────────
const calls = [
  { index: 0, legKey: 'k0', portId: 'A', name: 'A' },
  { index: 1, legKey: 'k1', portId: 'B', name: 'B' },
  { index: 2, legKey: 'k2', portId: 'C', name: 'C' },
  { index: 3, legKey: 'k3', portId: 'A', name: 'A again' }, // a port called twice
];
let P;
test.before(async () => { P = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/utils/voyagePortChoices.js')).href); });

test('presets: POL defaults to the next port; the last call falls back to the call before it', () => {
  assert.equal(P.defaultPolIndex(calls, 1), 1);
  assert.equal(P.defaultPolIndex(calls, 0), 0);
  assert.equal(P.defaultPolIndex(calls, 3), 2);   // next is the last call: nothing after it, so the call before
  assert.equal(P.defaultPolIndex(calls, null), 0); // finished / not started: first call
  assert.equal(P.defaultPolIndex(calls.slice(0, 1), 0), -1); // fewer than two calls: nothing to book
});

test('presets: POD choices are only the calls after the POL, at a different port', () => {
  assert.deepEqual(P.podChoices(calls, 0).map((c) => c.name), ['B', 'C']);   // 'A again' is the POL port: excluded
  assert.deepEqual(P.podChoices(calls, 1).map((c) => c.name), ['C', 'A again']);
  assert.deepEqual(P.podChoices(calls, 3), []);
  assert.deepEqual(P.polChoices(calls).map((c) => c.name), ['A', 'B', 'C']); // the last call can never be a POL
});

test('presets: a repeated port is told apart by its leg key; old data without keys falls back to the port id', () => {
  assert.equal(P.callIndex(calls, 'k3', 'A'), 3);
  assert.equal(P.callIndex(calls, 'k0', 'A'), 0);
  assert.equal(P.callIndex(calls.map((c) => ({ ...c, legKey: null })), null, 'B'), 1);
  assert.equal(P.callIndex(calls, null, 'Z'), -1);
});

test('presets: the start value pins round + voyage and fills POL, never POD', () => {
  const s = P.fixedRouteStart({ roundId: 'R1', voyageId: 'V1', calls, nextIndex: 1 });
  assert.deepEqual(s, { roundId: 'R1', voyageId: 'V1', polId: 'B', polLegKey: 'k1', podId: '', podLegKey: '' });
});

test('presets: validation needs the voyage, a POL, a later POD at another port', () => {
  const ok = { roundId: 'R1', voyageId: 'V1', polId: 'A', polLegKey: 'k0', podId: 'C', podLegKey: 'k2' };
  assert.deepEqual(P.validateFixedRoute(ok, calls), {});
  assert.ok(P.validateFixedRoute({ ...ok, voyageId: '' }, calls).voyageId);
  assert.ok(P.validateFixedRoute({ ...ok, polId: '', polLegKey: '' }, calls).polId);
  assert.ok(P.validateFixedRoute({ ...ok, podId: '', podLegKey: '' }, calls).podId);
  assert.ok(P.validateFixedRoute({ ...ok, polId: 'C', polLegKey: 'k2', podId: 'B', podLegKey: 'k1' }, calls).podId); // backwards
  assert.ok(P.validateFixedRoute({ ...ok, podId: 'A', podLegKey: 'k3' }, calls).podId);                                // same port A to A
});

test('presets: the server also judges a pinned voyage (POL before POD, right direction)', () => {
  const id = (n) => `000000000000000000000${String(n).padStart(3, '0')}`;
  const v = { _id: id(100), status: 'Scheduled', direction: 'East', portCalls: [
    { legKey: 'k0', portId: id(1) }, { legKey: 'k1', portId: id(2) }, { legKey: 'k2', portId: id(3) },
  ] };
  assert.equal(M.checkChosenVoyage({ voyages: [v], voyageId: id(100), polId: id(1), podId: id(3) }).status, 'resolved');
  assert.equal(M.checkChosenVoyage({ voyages: [v], voyageId: id(100), polId: id(3), podId: id(1) }).status, 'unresolved'); // backwards
  assert.equal(M.checkChosenVoyage({ voyages: [{ ...v, status: 'Cancelled' }], voyageId: id(100), polId: id(1), podId: id(3) }).status, 'unresolved');
  assert.equal(M.checkChosenVoyage({ voyages: [{ ...v, status: 'Completed' }], voyageId: id(100), polId: id(1), podId: id(3) }).status, 'unresolved');
});
