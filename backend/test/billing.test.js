'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/modules/billing/billing.logic');

const bk = (id, rate, extra = {}) => ({
  _id: id, agentId: 'A1', voyageId: 'V1', containerTypeId: 'C20', freightRate: rate, status: 'Final Loading', ...extra,
});

test('items group by bill-to + voyage + container type + rate; never merge different rates', () => {
  const items = L.groupBookingsIntoItems([bk('1', 100), bk('2', 100), bk('3', 120), bk('4', 100, { containerTypeId: 'C40' })]);
  assert.equal(items.length, 3);
  const a = items.find((i) => i.freightRate === 100 && i.containerTypeId === 'C20');
  assert.equal(a.loadedQty, 2);
  assert.deepEqual(a.bookingIds, ['1', '2']);
});

test('only Final Loading bookings become items; bill-to defaults to the agent', () => {
  const items = L.groupBookingsIntoItems([bk('1', 100, { status: 'Confirmed' }), bk('2', 100, { billToPartyId: 'A2' })]);
  assert.equal(items.length, 1);
  assert.equal(items[0].billToAgentId, 'A2');
});

test('line amount is exact integer minor units', () => {
  const l = L.buildLine({ freightRate: 1234.56, loadedQty: 3 }, 'USD');
  assert.deepEqual(l, { qty: 3, priceMinor: 123456, amountMinor: 370368 });
  assert.equal(L.buildLine({ freightRate: 0.1, loadedQty: 3 }, 'USD').amountMinor, 30);
});

test('status is derived from money fields; overdue is lazy', () => {
  const base = { status: 'Issued', totalMinor: 10000, paidMinor: 0, creditedMinor: 0, dueDate: '2099-01-01' };
  assert.equal(L.deriveStatus(base), 'Issued');
  assert.equal(L.deriveStatus({ ...base, paidMinor: 4000 }), 'Partially Paid');
  assert.equal(L.deriveStatus({ ...base, paidMinor: 10000 }), 'Paid');
  assert.equal(L.deriveStatus({ ...base, paidMinor: 6000, creditedMinor: 4000 }), 'Paid');
  assert.equal(L.deriveStatus({ ...base, dueDate: '2000-01-01' }), 'Overdue');
  assert.equal(L.deriveStatus({ ...base, dueDate: '2000-01-01', paidMinor: 10000 }), 'Paid');
  assert.equal(L.deriveStatus({ ...base, status: 'Cancelled' }), 'Cancelled');
  assert.equal(L.deriveStatus({ ...base, status: 'Draft' }), 'Draft');
});

test('commission rules (OGA example: 12 bookings at 250 = 3000.00)', () => {
  const facts = { containers: 12, bookings: 12, totalMinor: 12000000 };
  assert.equal(L.computeCommission({ commission: { rule: 'fixedPerBooking', amountMinor: 25000 } }, facts), 300000);
  assert.equal(L.computeCommission({ commission: { rule: 'fixedPerContainer', amountMinor: 1000 } }, facts), 12000);
  assert.equal(L.computeCommission({ commission: { rule: 'percentOfRate', percentBp: 250 } }, facts), 300000);
  assert.equal(L.computeCommission({ commission: { rule: null } }, facts), 0);
  assert.equal(L.computeCommission(null, facts), 0);
});
