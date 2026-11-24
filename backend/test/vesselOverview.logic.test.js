'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/modules/voyages/vesselOverview.logic');

const v = (id, o = {}) => ({ _id: id, voyageNumber: `V000${id}E`, voyageName: null, status: 'Scheduled', sequence: Number(id), etd: null, ...o });
const rows = (o) => new Map(Object.entries(o).map(([k, r]) => [k, r]));

test('open sets: Planned/Active rounds, not Completed/Cancelled voyages', () => {
  assert.deepEqual([...L.OPEN_ROUND_STATUSES], ['Planned', 'Active']);
  for (const s of ['Scheduled', 'Departed', 'In Transit', 'Arrived']) assert.equal(L.isOpenVoyage(s), true);
  for (const s of ['Completed', 'Cancelled']) assert.equal(L.isOpenVoyage(s), false);
  assert.equal(L.isOpenRound('Completed'), false);
  assert.equal(L.isOpenRound('Cancelled'), false);
});

test('orderRounds: Active first, then earliest start, no date last', () => {
  const out = L.orderRounds([
    { _id: 'a', status: 'Planned', startDate: '2026-03-01', roundNumber: 'R3' },
    { _id: 'b', status: 'Planned', startDate: null, roundNumber: 'R4' },
    { _id: 'c', status: 'Active', startDate: '2026-05-01', roundNumber: 'R2' },
    { _id: 'd', status: 'Planned', startDate: '2026-02-01', roundNumber: 'R1' },
  ]);
  assert.deepEqual(out.map((r) => r._id), ['c', 'd', 'a', 'b']);
});

test('nextVoyage: earliest ETD among open voyages, no ETD last, none = null', () => {
  const n = L.nextVoyage([
    v('1', { etd: '2026-06-10' }), v('2', { etd: '2026-06-01', voyageName: 'Spring' }), v('3'), v('4', { etd: '2026-05-01', status: 'Completed' }),
  ]);
  assert.equal(n.voyageId, '2');
  assert.equal(n.label, 'Spring');
  assert.equal(L.nextVoyage([v('9', { status: 'Cancelled' })]), null);
  assert.equal(L.nextVoyage([]), null);
  assert.equal(L.nextVoyage([v('5'), v('6')]).voyageId, '5'); // all without ETD: voyage number decides
});

test('voyageNumbers: a missing engine row = nothing placed, no percent', () => {
  assert.deepEqual(L.voyageNumbers(undefined), { loadedTEU: 0, onboardTEU: 0, remainingTEU: null, utilisationPct: null });
  assert.equal(L.voyageNumbers({ loadedTEU: 40, onboardTEU: 30, remainingTEU: 70, utilisationPct: 30 }).utilisationPct, 30);
});

test('totalsOf: booked is a sum, peak is the highest percent (never a sum), overbooked flags a voyage over capacity', () => {
  const t = L.totalsOf([
    { loadedTEU: 40, onboardTEU: 30, remainingTEU: 70, utilisationPct: 30 },
    { loadedTEU: 60, onboardTEU: 110, remainingTEU: -10, utilisationPct: 110 },
  ]);
  assert.deepEqual(t, { bookedTEU: 100, peakUtilisationPct: 110, overbooked: true });
});

test('totalsOf: no capacity (null percents) gives a null peak, empty gives zero', () => {
  const t = L.totalsOf([{ loadedTEU: 12, onboardTEU: 12, remainingTEU: null, utilisationPct: null }]);
  assert.equal(t.peakUtilisationPct, null);
  assert.equal(t.bookedTEU, 12);
  assert.equal(t.overbooked, false);
  assert.deepEqual(L.totalsOf([]), { bookedTEU: 0, peakUtilisationPct: null, overbooked: false });
});

test('roundBlock: voyages keep sequence order and carry the engine numbers', () => {
  const b = L.roundBlock({ _id: 'r1', roundNumber: 'R1', status: 'Active' }, [v('2'), v('1')],
    rows({ 1: { loadedTEU: 10, onboardTEU: 10, remainingTEU: 90, utilisationPct: 10 } }));
  assert.deepEqual(b.voyages.map((x) => x._id), ['1', '2']);
  assert.equal(b.voyages[0].utilisationPct, 10);
  assert.equal(b.voyages[1].utilisationPct, null);
  assert.equal(b.totals.bookedTEU, 10);
  assert.equal(b.round.roundName, null);
});

test('vesselRow: Active round is primary, counts the extras, null capacity stays null', () => {
  const planned = L.roundBlock({ _id: 'p', roundNumber: 'R2', status: 'Planned', startDate: '2026-09-01' }, [v('3', { etd: '2026-09-02' })], new Map());
  const active = L.roundBlock({ _id: 'a', roundNumber: 'R1', roundName: 'Spring', status: 'Active', startDate: '2026-05-01' },
    [v('1', { etd: '2026-06-01' }), v('2', { etd: '2026-06-20' })],
    rows({ 1: { loadedTEU: 20, onboardTEU: 20, remainingTEU: null, utilisationPct: null } }));
  const r = L.vesselRow({ _id: 'x', vesselCode: 'VS1', vesselName: 'Vessel One', capacity: null }, [planned, active]);
  assert.equal(r.primaryRound.roundId, 'a');
  assert.equal(r.extraRounds, 1);
  assert.equal(r.openVoyages, 3);
  assert.equal(r.extraVoyages, 2);
  assert.equal(r.nextVoyage.voyageId, '1');
  assert.equal(r.bookedTEU, 20);
  assert.equal(r.peakUtilisationPct, null);
  assert.equal(r.capacity, null);
});
