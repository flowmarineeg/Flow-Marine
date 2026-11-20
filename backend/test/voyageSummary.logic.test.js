'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/modules/voyages/voyageSummary.logic');

const by = (p = 0, c = 0, f = 0, x = 0, frP = 0, frC = 0, frF = 0, frX = 0, teuP = 0, teuC = 0, teuF = 0, teuX = 0) => ({
  Pending: { bookings: p, freight: frP, teu: teuP },
  Confirmed: { bookings: c, freight: frC, teu: teuC },
  'Final Loading': { bookings: f, freight: frF, teu: teuF },
  Cancelled: { bookings: x, freight: frX, teu: teuX },
});

test('bookings card: every status is present and the chips add up to the totals', () => {
  const card = L.bookingsCard(by(3, 2, 0, 1), by(5, 8, 9, 0));
  assert.deepEqual(card.estimated.byStatus, { Pending: 3, Confirmed: 2, 'Final Loading': 0, Cancelled: 1 });
  assert.equal(card.estimated.total, 6);
  assert.equal(card.operational.total, 22);
  assert.equal(card.total, 28);
  for (const l of [card.estimated, card.operational]) assert.equal(Object.values(l.byStatus).reduce((a, b) => a + b, 0), l.total);
  const empty = L.bookingsCard(undefined, undefined);
  assert.equal(empty.total, 0);
  assert.deepEqual(Object.keys(empty.estimated.byStatus), ['Pending', 'Confirmed', 'Final Loading', 'Cancelled']);
});

test('TEU card: values come from the capacity row; Cancelled bookings never count', () => {
  const est = by(0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 0, 99);   // Cancelled 99 must be ignored
  const op = by(0, 0, 0, 0, 0, 0, 0, 0, 4, 6, 8, 77);
  const row = { layer1: { loadedTEU: 30 }, layer2: { loadedTEU: 18 }, capacityBeforeLoading: 500, onboardTEU: 40, utilisationPct: 8 };
  const t = L.teuCard(est, op, row);
  assert.equal(t.estimated, 30); assert.equal(t.operational, 18);
  assert.equal(t.notPlaced, 0);
  assert.deepEqual([t.capacityTEU, t.peakOnboardTEU, t.utilisationPct], [500, 40, 8]);
});

test('TEU card: bookings the engine did not place are reported as notPlaced (never negative)', () => {
  const est = by(0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 0, 0);          // 30 TEU of live estimates
  const op = by(0, 0, 0, 0, 0, 0, 0, 0, 4, 6, 8, 0);             // 18 TEU of live bookings
  assert.equal(L.teuCard(est, op, { layer1: { loadedTEU: 24 }, layer2: { loadedTEU: 18 } }).notPlaced, 6);
  assert.equal(L.teuCard(est, op, { layer1: { loadedTEU: 40 }, layer2: { loadedTEU: 18 } }).notPlaced, 0); // engine higher: not negative
  const none = L.teuCard(est, op, null);                             // Cancelled voyage: no capacity row
  assert.deepEqual([none.estimated, none.operational, none.notPlaced, none.capacityTEU, none.utilisationPct], [0, 0, 48, null, null]);
});

test('revenue card: estimated = L1 not Cancelled; operational = Final Loading only; pipeline = Pending + Confirmed; USD', () => {
  const est = by(0, 0, 0, 0, 1000, 500.5, 0, 9999);
  const op = by(0, 0, 0, 0, 300, 200, 4000.255, 8888);
  const r = L.revenueCard(est, op, { amount: 1234.5, invoices: 2 });
  assert.equal(r.currency, 'USD');
  assert.equal(r.estimated, 1500.5);
  assert.equal(r.operational, 4000.26);
  assert.deepEqual(r.pipeline, { pending: 300, confirmed: 200 });
  assert.deepEqual(r.invoiced, { amount: 1234.5, invoices: 2, grossBeforeNotes: true });
  assert.deepEqual(L.revenueCard(undefined, undefined, null).invoiced, { amount: 0, invoices: 0, grossBeforeNotes: true });
});

test('permission shaping: no revenue block without invoices:read or reports:read', () => {
  const s = { voyage: { _id: 1 }, bookings: {}, revenue: { currency: 'USD', operational: 5 } };
  assert.equal('revenue' in L.shapeForPermissions(s, false), false);
  assert.equal(L.shapeForPermissions(s, true).revenue.operational, 5);
  assert.ok(L.shapeForPermissions(s, false).voyage);
});

test('canBook: voyage Cancelled/Completed, round Closed, round Cancelled/Completed, all clear', () => {
  assert.deepEqual(L.canBook({ voyageStatus: 'Cancelled', roundStatus: 'Active', closeStatus: 'Open' }), { canBook: false, reason: 'VOYAGE_CANCELLED' });
  assert.deepEqual(L.canBook({ voyageStatus: 'Completed', roundStatus: 'Active', closeStatus: 'Open' }), { canBook: false, reason: 'VOYAGE_COMPLETED' });
  assert.deepEqual(L.canBook({ voyageStatus: 'Scheduled', roundStatus: 'Active', closeStatus: 'Closed' }), { canBook: false, reason: 'ROUND_CLOSED' });
  assert.deepEqual(L.canBook({ voyageStatus: 'Scheduled', roundStatus: 'Cancelled', closeStatus: 'Open' }), { canBook: false, reason: 'ROUND_NOT_BOOKABLE' });
  assert.deepEqual(L.canBook({ voyageStatus: 'Scheduled', roundStatus: 'Completed', closeStatus: 'Open' }), { canBook: false, reason: 'ROUND_NOT_BOOKABLE' });
  for (const v of ['Scheduled', 'Departed', 'In Transit', 'Arrived']) for (const r of ['Planned', 'Active']) {
    assert.deepEqual(L.canBook({ voyageStatus: v, roundStatus: r, closeStatus: 'Open' }), { canBook: true, reason: null }, `${v}/${r}`);
  }
});

const calls = (...names) => names.map((n, i) => ({ legKey: `L${i + 1}`, portId: `p-${n}`, portName: n, portCode: n.toUpperCase(), eta: `2026-11-0${i + 1}` }));
const states = (r) => r.ports.map((p) => p.state).join(',');

test('nextPort: Scheduled = not started, next is the first port', () => {
  const r = L.nextPort({ calls: calls('a', 'b', 'c'), voyageStatus: 'Scheduled', tracking: [{ portId: 'p-b', status: 'At Port' }] });
  assert.equal(r.nextPort.state, 'not-started');
  assert.equal(r.nextPort.current, null);
  assert.equal(r.nextPort.next.name, 'a');
  assert.equal(states(r), 'next,upcoming,upcoming');
  assert.equal(r.nextPort.isEstimate, true);
});

test('nextPort: Departed / In Transit without tracking assumes the first port was left; next = second port with its ETA', () => {
  for (const st of ['Departed', 'In Transit']) {
    const r = L.nextPort({ calls: calls('a', 'b', 'c'), voyageStatus: st, tracking: [] });
    assert.equal(r.nextPort.state, 'underway'); assert.equal(r.nextPort.source, 'status');
    assert.equal(r.nextPort.next.name, 'b'); assert.equal(r.nextPort.next.eta, '2026-11-02');
    assert.equal(states(r), 'done,next,upcoming');
  }
});

test('nextPort: tracking Departed at port i -> underway, next is i+1', () => {
  const r = L.nextPort({ calls: calls('a', 'b', 'c'), voyageStatus: 'In Transit', tracking: [{ portId: 'p-a', status: 'At Port' }, { portId: 'p-b', status: 'Departed' }] });
  assert.equal(r.nextPort.state, 'underway'); assert.equal(r.nextPort.source, 'tracking');
  assert.equal(r.nextPort.next.name, 'c'); assert.equal(r.nextPort.lastTracking.status, 'Departed');
  assert.equal(states(r), 'done,done,next');
});

test('nextPort: tracking At Port / Arrived / Anchored / Delayed -> at-port, current is that port, next is the following', () => {
  for (const status of ['At Port', 'Arrived', 'Anchored', 'Delayed']) {
    const r = L.nextPort({ calls: calls('a', 'b', 'c'), voyageStatus: 'In Transit', tracking: [{ portId: 'p-b', status }] });
    assert.equal(r.nextPort.state, 'at-port', status);
    assert.equal(r.nextPort.current.name, 'b'); assert.equal(r.nextPort.next.name, 'c');
    assert.equal(states(r), 'done,current,next');
  }
  const last = L.nextPort({ calls: calls('a', 'b'), voyageStatus: 'In Transit', tracking: [{ portId: 'p-b', status: 'At Port' }] });
  assert.equal(last.nextPort.next, null);
});

test('nextPort: Arrived / Completed = finished (last port current); Cancelled = finished with no current/next', () => {
  const a = L.nextPort({ calls: calls('a', 'b', 'c'), voyageStatus: 'Arrived', tracking: [] });
  assert.equal(a.nextPort.state, 'finished'); assert.equal(a.nextPort.current.name, 'c'); assert.equal(a.nextPort.next, null);
  assert.equal(states(a), 'done,done,current');
  const c = L.nextPort({ calls: calls('a', 'b'), voyageStatus: 'Cancelled', tracking: [] });
  assert.equal(c.nextPort.state, 'finished'); assert.equal(c.nextPort.current, null); assert.equal(c.nextPort.next, null);
  assert.equal(states(c), 'upcoming,upcoming');
});

test('nextPort: a tracking port that is not on the run is ignored', () => {
  const r = L.nextPort({ calls: calls('a', 'b', 'c'), voyageStatus: 'In Transit', tracking: [{ portId: 'p-zzz', status: 'At Port' }] });
  assert.equal(r.nextPort.source, 'status'); assert.equal(r.nextPort.next.name, 'b');
});

test('nextPort: a repeated port (A-B-A) is matched at or after the last known position, never backwards', () => {
  const rep = [{ legKey: 'L1', portId: 'p-a', portName: 'A' }, { legKey: 'L2', portId: 'p-b', portName: 'B' }, { legKey: 'L3', portId: 'p-a', portName: 'A' }];
  // first A, then B, then A again (the second A is the last call)
  const r = L.nextPort({ calls: rep, voyageStatus: 'In Transit', tracking: [
    { portId: 'p-a', status: 'Departed' }, { portId: 'p-b', status: 'Departed' }, { portId: 'p-a', status: 'At Port' }] });
  assert.equal(r.nextPort.state, 'at-port'); assert.equal(r.nextPort.current.index, 2); assert.equal(r.nextPort.next, null);
  const early = L.nextPort({ calls: rep, voyageStatus: 'In Transit', tracking: [{ portId: 'p-a', status: 'Departed' }] });
  assert.equal(early.nextPort.next.index, 1); // the first A, so B is next
});

test('nextPort: no port calls = unknown, empty strip', () => {
  const r = L.nextPort({ calls: [], voyageStatus: 'Scheduled', tracking: [] });
  assert.equal(r.nextPort.state, 'unknown'); assert.deepEqual(r.ports, []);
});
