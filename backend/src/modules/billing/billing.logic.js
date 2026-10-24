'use strict';

// Sprint051 - pure billing rules (no DB), unit tested in test/billing.test.js.

const { toMinor } = require('../../utils/money');

/**
 * D1-A: derive pricing-group "items" from Final Loading bookings.
 * Group key = bill-to party + voyage + container type + freight rate.
 * One booking = one container, so loadedQty = number of bookings in the group.
 * bookings: [{ _id, agentId, billToPartyId?, voyageId, containerTypeId, freightRate, status }]
 */
const groupBookingsIntoItems = (bookings) => {
  const groups = new Map();
  for (const b of bookings) {
    if (b.status !== 'Final Loading') continue;
    const billTo = String(b.billToPartyId || b.agentId);
    const key = [billTo, b.voyageId, b.containerTypeId, Number(b.freightRate)].join('|');
    let g = groups.get(key);
    if (!g) {
      g = {
        billToAgentId: billTo, voyageId: String(b.voyageId),
        containerTypeId: String(b.containerTypeId), freightRate: Number(b.freightRate),
        bookingIds: [], loadedQty: 0,
      };
      groups.set(key, g);
    }
    g.bookingIds.push(String(b._id));
    g.loadedQty += 1;
  }
  return [...groups.values()];
};

/** Invoice line for an item in a given currency (integer minor units, exact). */
const buildLine = (item, currency) => {
  const priceMinor = toMinor(item.freightRate, currency);
  const qty = item.loadedQty;
  return { qty, priceMinor, amountMinor: qty * priceMinor };
};

const sumMinor = (lines) => lines.reduce((a, l) => a + l.amountMinor, 0);

/** Open balance of an invoice-like document. */
const balanceMinor = (inv) => (inv.totalMinor || 0) - (inv.paidMinor || 0) - (inv.creditedMinor || 0);

/**
 * Status derived from money fields only (D4-A one recalc function).
 * Overdue is derived lazily (D16): past due date with an open balance.
 */
const deriveStatus = (inv, now = new Date()) => {
  if (inv.status === 'Draft' || inv.status === 'Cancelled') return inv.status;
  const bal = balanceMinor(inv);
  if (bal <= 0) return 'Paid';
  if (inv.dueDate && new Date(inv.dueDate) < now) return 'Overdue';
  if ((inv.paidMinor || 0) > 0) return 'Partially Paid';
  return 'Issued';
};

/**
 * Commission for an invoice under one agreement.
 * agreement.commission: { rule, amountMinor, percentBp }
 * facts: { containers, bookings, totalMinor }
 */
const computeCommission = (agreement, facts) => {
  const c = agreement?.commission;
  if (!c || !c.rule) return 0;
  if (c.rule === 'fixedPerContainer') return facts.containers * (c.amountMinor || 0);
  if (c.rule === 'fixedPerBooking') return facts.bookings * (c.amountMinor || 0);
  if (c.rule === 'percentOfRate') return Math.floor((facts.totalMinor * (c.percentBp || 0)) / 10000);
  return 0;
};

module.exports = { groupBookingsIntoItems, buildLine, sumMinor, balanceMinor, deriveStatus, computeCommission };
