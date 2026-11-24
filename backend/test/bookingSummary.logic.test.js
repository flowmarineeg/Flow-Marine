'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TABS, summariseEstimated, summariseOperational, sortRows } = require('../src/modules/bookings/bookingSummary.logic');

test('the four Bookings tabs', () => {
  assert.deepEqual([...TABS], ['estimated', 'operational', 'discharged', 'remaining']);
});

test('estimated: Layer 1 totals pass through, freight rounded to cents', () => {
  const m = summariseEstimated([{ _id: 'v1', bookings: 3, totalFreight: 100.005 + 200.1, totalTEU: 12 }, { _id: 'v2', bookings: 1, totalFreight: 50, totalTEU: 2 }]);
  assert.deepEqual(m.get('v1'), { bookings: 3, totalFreight: 300.11, totalTEU: 12 });
  assert.deepEqual(m.get('v2'), { bookings: 1, totalFreight: 50, totalTEU: 2 });
});

test('operational: one booking = one container, TEU from the SIZE (20ft 1, 40ft/40HC/45ft 2)', () => {
  const sizes = new Map([['t20', '20ft'], ['t40', '40ft'], ['thc', '40HC'], ['t45', '45ft']]);
  const m = summariseOperational([
    { voyageId: 'v1', containerTypeId: 't20', count: 4, freight: 400 },
    { voyageId: 'v1', containerTypeId: 't40', count: 2, freight: 600 },
    { voyageId: 'v1', containerTypeId: 'thc', count: 1, freight: 350.5 },
    { voyageId: 'v1', containerTypeId: 't45', count: 1, freight: 10 },
    { voyageId: 'v2', containerTypeId: 't20', count: 5, freight: 500 },
  ], sizes);
  assert.deepEqual(m.get('v1'), { bookings: 8, totalFreight: 1360.5, totalTEU: 4 + 4 + 2 + 2 });
  assert.deepEqual(m.get('v2'), { bookings: 5, totalFreight: 500, totalTEU: 5 });
});

test('operational: an unknown container size counts as 1 TEU (resolver fail-safe) and ObjectId-like keys match by string', () => {
  const id = { toString: () => 'abc' };
  const m = summariseOperational([{ voyageId: id, containerTypeId: { toString: () => 'ty' }, count: 2, freight: 0 }], new Map([['ty', 'weird']]));
  assert.deepEqual(m.get('abc'), { bookings: 2, totalFreight: 0, totalTEU: 2 });
});

test('empty input gives empty maps', () => {
  assert.equal(summariseEstimated([]).size, 0);
  assert.equal(summariseOperational([], new Map()).size, 0);
});

test('sortRows: newest round first, then voyage number', () => {
  const rows = sortRows([
    { voyageNumber: 'V0002E', roundStart: '2026-01-01' },
    { voyageNumber: 'V0003E', roundStart: '2026-06-01' },
    { voyageNumber: 'V0001E', roundStart: '2026-01-01' },
  ]);
  assert.deepEqual(rows.map((r) => r.voyageNumber), ['V0003E', 'V0001E', 'V0002E']);
});

const { summariseByStatus, portMatch, portFilter, STATUSES } = require('../src/modules/bookings/bookingSummary.logic');

test('summariseByStatus (Layer 1): all four statuses present, stored TEU and freight per status', () => {
  const m = summariseByStatus([{ _id: 'Pending', bookings: 2, totalFreight: 100.005, totalTEU: 6 }, { _id: 'Cancelled', bookings: 1, totalFreight: 50, totalTEU: 2 }], 1);
  assert.deepEqual(Object.keys(m), [...STATUSES]);
  assert.deepEqual(m.Pending, { bookings: 2, freight: 100.01, teu: 6 });
  assert.deepEqual(m.Cancelled, { bookings: 1, freight: 50, teu: 2 });
  assert.deepEqual(m.Confirmed, { bookings: 0, freight: 0, teu: 0 });
});

test('summariseByStatus (Layer 2): TEU from container size per container; unknown statuses are ignored', () => {
  const sizes = new Map([['t20', '20ft'], ['thc', '40HC']]);
  const m = summariseByStatus([
    { status: 'Final Loading', containerTypeId: 't20', count: 3, freight: 300 },
    { status: 'Final Loading', containerTypeId: 'thc', count: 2, freight: 700 },
    { status: 'Pending', containerTypeId: 't20', count: 1, freight: 90 },
    { status: 'Weird', containerTypeId: 't20', count: 9, freight: 9 },
  ], 2, sizes);
  assert.deepEqual(m['Final Loading'], { bookings: 5, freight: 1000, teu: 3 + 4 });
  assert.deepEqual(m.Pending, { bookings: 1, freight: 90, teu: 1 });
  assert.equal(m.Weird, undefined);
});

test('portMatch: leg key wins per side, a side without a key falls back to the port id; port id alone matches either side', () => {
  assert.deepEqual(portMatch('L2', 'p1'), [{ polLegKey: 'L2' }, { podLegKey: 'L2' }, { polLegKey: null, polId: 'p1' }, { podLegKey: null, podId: 'p1' }]);
  assert.deepEqual(portMatch('L2', ''), [{ polLegKey: 'L2' }, { podLegKey: 'L2' }]);
  assert.deepEqual(portMatch('', 'p1'), [{ polId: 'p1' }, { podId: 'p1' }]);
  assert.equal(portMatch('', ''), null);
  assert.equal(portMatch(undefined, undefined), null);
});

test('portFilter: a bad port id is a 400, a valid or empty one passes', () => {
  assert.throws(() => portFilter('', 'nope'), (e) => e.status === 400);
  assert.throws(() => portFilter('L1', '{"$ne":1}'), (e) => e.status === 400);
  assert.equal(portFilter('', ''), null);
  assert.ok(portFilter('L1', '6af350817bae2d4ecd54da04'));
});

// ── vessel -> round roll-ups (vessel-first navigation, Sprint C1) ───────────────────────────────────────────────
const { roundStatusesFor, parseIncludeClosed, wantsZeroRows, rollupRounds, rollupVessels } = require('../src/modules/bookings/bookingSummary.logic');

test('roundStatusesFor: Planned/Active, plus Completed only when asked; Cancelled never', () => {
  assert.deepEqual(roundStatusesFor(false), ['Planned', 'Active']);
  assert.deepEqual(roundStatusesFor(true), ['Planned', 'Active', 'Completed']);
});

test('parseIncludeClosed: ON by default for discharged/remaining, OFF for estimated/operational, explicit value wins', () => {
  for (const t of ['discharged', 'remaining']) { assert.equal(parseIncludeClosed(undefined, t), true); assert.equal(parseIncludeClosed('', t), true); assert.equal(parseIncludeClosed('0', t), false); assert.equal(parseIncludeClosed('false', t), false); }
  for (const t of ['estimated', 'operational']) { assert.equal(parseIncludeClosed(undefined, t), false); assert.equal(parseIncludeClosed('1', t), true); assert.equal(parseIncludeClosed('true', t), true); }
});

test('wantsZeroRows: only Estimated/Operational, never for partner users or when a booking filter is on', () => {
  assert.equal(wantsZeroRows('estimated'), true);
  assert.equal(wantsZeroRows('operational'), true);
  assert.equal(wantsZeroRows('discharged'), false);
  assert.equal(wantsZeroRows('remaining'), false);
  assert.equal(wantsZeroRows('operational', { scoped: true }), false);
  for (const f of [{ search: 'x' }, { agentId: 'a' }, { partnerId: 'p' }, { status: 'Pending' }]) assert.equal(wantsZeroRows('estimated', f), false);
});

const rounds = [
  { _id: 'r1', vesselId: 'vA', roundNumber: 'R1', status: 'Planned', startDate: '2026-09-01' },
  { _id: 'r2', vesselId: 'vA', roundNumber: 'R2', status: 'Active', startDate: '2026-05-01', roundName: 'Spring' },
  { _id: 'r3', vesselId: 'vB', roundNumber: 'R3', status: 'Active', startDate: '2026-04-01' },
  { _id: 'r4', vesselId: 'vB', roundNumber: 'R4', status: 'Planned', startDate: '2026-10-01' },
];
const voyages = [
  { _id: 'a1', roundId: 'r1', status: 'Scheduled' },
  { _id: 'a2', roundId: 'r2', status: 'In Transit' },
  { _id: 'a3', roundId: 'r2', status: 'Cancelled' },
  { _id: 'b1', roundId: 'r3', status: 'Scheduled' },
  { _id: 'c1', roundId: 'r4', status: 'Cancelled' }, // only a cancelled voyage: no zero row
];
const totals = new Map([['a2', { bookings: 3, totalFreight: 100.01, totalTEU: 5 }], ['a3', { bookings: 1, totalFreight: 50.1, totalTEU: 2 }], ['b1', { bookings: 2, totalFreight: 10, totalTEU: 4 }]]);

test('rollupRounds (zero rows on): rounds with bookings or a live voyage; Active first; voyage count excludes Cancelled', () => {
  const out = rollupRounds({ rounds, voyages, totals, zeroRows: true });
  assert.deepEqual(out.map((r) => r.roundId), ['r3', 'r2', 'r1']); // r4 has only a cancelled voyage and no bookings: dropped
  const r2 = out[1];
  assert.deepEqual([r2.voyages, r2.bookings, r2.totalTEU, r2.totalFreight, r2.roundName], [1, 4, 7, 150.11, 'Spring']); // a3's bookings still count
  assert.deepEqual([out[2].bookings, out[2].totalTEU, out[2].totalFreight], [0, 0, 0]); // r1: zero row
});

test('rollupRounds (zero rows off): only rounds that have bookings', () => {
  assert.deepEqual(rollupRounds({ rounds, voyages, totals, zeroRows: false }).map((r) => r.roundId), ['r3', 'r2']);
});

test('rollupVessels: sums its rounds, sorted by vessel name, a round without a vessel record is skipped', () => {
  const roundRows = rollupRounds({ rounds, voyages, totals, zeroRows: true });
  const vessels = new Map([['vA', { vesselCode: 'AAA', vesselName: 'Zeta' }], ['vB', { vesselCode: 'BBB', vesselName: 'Alpha' }]]);
  const out = rollupVessels(roundRows, vessels);
  assert.deepEqual(out.map((v) => v.vesselName), ['Alpha', 'Zeta']);
  const zeta = out[1];
  assert.deepEqual([zeta.rounds, zeta.voyages, zeta.bookings, zeta.totalTEU, zeta.totalFreight], [2, 2, 4, 7, 150.11]);
  assert.deepEqual(rollupVessels(roundRows, new Map([['vB', { vesselCode: 'BBB', vesselName: 'Alpha' }]])).map((v) => v.vesselName), ['Alpha']);
});

test('the round rows add up to the vessel row and to the voyage totals (nothing lost or invented)', () => {
  const roundRows = rollupRounds({ rounds, voyages, totals, zeroRows: true });
  const sumVoyages = [...totals.values()].reduce((s, t) => s + t.bookings, 0);
  assert.equal(roundRows.reduce((s, r) => s + r.bookings, 0), sumVoyages);
  const vessels = new Map([['vA', { vesselCode: 'A', vesselName: 'A' }], ['vB', { vesselCode: 'B', vesselName: 'B' }]]);
  assert.equal(rollupVessels(roundRows, vessels).reduce((s, v) => s + v.bookings, 0), sumVoyages);
});
