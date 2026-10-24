'use strict';

// Sprint053 - pure partner-settlement rules (no DB), unit tested in
// test/partnerSettlement.test.js. All amounts are integer minor units of ONE currency.

const { allocate } = require('../../utils/money');

/**
 * Profit of a Round from its ledger lines.
 * lines: [{ accountCode, debitMinor, creditMinor }]
 * Accrual: revenue (4xxx credits - debits) - expenses (5xxx debits - credits).
 * Cash:    accrual profit - receivable still outstanding (1100) + payable still outstanding (2000),
 *          i.e. revenue actually collected (cash or offset) - expenses actually paid (cash or offset).
 */
const computeProfit = (lines, mode = 'Accrual') => {
  let revenue = 0; let expense = 0; let receivable = 0; let payable = 0;
  for (const l of lines) {
    const d = l.debitMinor || 0; const c = l.creditMinor || 0;
    const code = String(l.accountCode || '');
    if (code.startsWith('4')) revenue += c - d;
    else if (code.startsWith('5')) expense += d - c;
    else if (code === '1100') receivable += d - c;
    else if (code === '2000') payable += c - d;
  }
  const accrual = revenue - expense;
  if (mode === 'Cash') {
    return {
      revenueMinor: revenue - receivable, expenseMinor: expense - payable,
      profitMinor: accrual - receivable + payable, outstandingReceivableMinor: receivable, outstandingPayableMinor: payable,
    };
  }
  return { revenueMinor: revenue, expenseMinor: expense, profitMinor: accrual, outstandingReceivableMinor: receivable, outstandingPayableMinor: payable };
};

/**
 * Split `distributableMinor` over the vessel shares (basis points) with no lost cent.
 * shares: [{ partnerId, shareBp }]  ->  [{ partnerId, shareBp, shareMinor }]
 */
const shareProfit = (distributableMinor, shares) => {
  const parts = allocate(distributableMinor, shares.map((s) => s.shareBp));
  return shares.map((s, i) => ({ partnerId: String(s.partnerId), shareBp: s.shareBp, shareMinor: parts[i] }));
};

/**
 * net = paidDirect - collectedDirect + share   (positive = receives, negative = pays)
 * paidDirect / collectedDirect: { [partnerId]: minor }
 */
const computePositions = (shared, paidDirect = {}, collectedDirect = {}) =>
  shared.map((s) => {
    const paid = paidDirect[s.partnerId] || 0;
    const coll = collectedDirect[s.partnerId] || 0;
    return { ...s, paidDirectMinor: paid, collectedDirectMinor: coll, netMinor: paid - coll + s.shareMinor };
  });

/**
 * Fewest sensible transfers: largest debtor pays largest creditor until one side is cleared.
 * If partners owe more than creditors are due (money held back as a reserve), the leftover
 * debt is returned per holder in `heldMinor`; it is not transferred.
 */
const suggestTransfers = (positions) => {
  const debtors = positions.filter((p) => p.netMinor < 0).map((p) => ({ id: p.partnerId, left: -p.netMinor }));
  const creditors = positions.filter((p) => p.netMinor > 0).map((p) => ({ id: p.partnerId, left: p.netMinor }));
  const order = (a, b) => b.left - a.left;
  debtors.sort(order); creditors.sort(order);
  const transfers = [];
  let di = 0; let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const amt = Math.min(debtors[di].left, creditors[ci].left);
    transfers.push({ fromPartnerId: debtors[di].id, toPartnerId: creditors[ci].id, amountMinor: amt });
    debtors[di].left -= amt; creditors[ci].left -= amt;
    if (debtors[di].left === 0) di += 1;
    if (creditors[ci].left === 0) ci += 1;
  }
  const held = debtors.filter((d) => d.left > 0).map((d) => ({ partnerId: d.id, heldMinor: d.left }));
  const unfundedCredit = creditors.filter((c) => c.left > 0).map((c) => ({ partnerId: c.id, missingMinor: c.left }));
  return { transfers, held, unfundedCredit };
};

/** Full pipeline used by the service. carryMinor is withheld from distribution (JV reserve). */
const settleRound = ({ lines, mode, shares, paidDirect, collectedDirect, carryMinor = 0 }) => {
  const p = computeProfit(lines, mode);
  if (carryMinor < 0) throw new RangeError('carry forward cannot be negative');
  if (carryMinor > 0 && carryMinor > p.profitMinor) throw new RangeError('carry forward exceeds the profit');
  const distributable = p.profitMinor - carryMinor;
  const positions = computePositions(shareProfit(distributable, shares), paidDirect, collectedDirect);
  return { ...p, carryForwardMinor: carryMinor, distributableMinor: distributable, positions, ...suggestTransfers(positions) };
};

module.exports = { computeProfit, shareProfit, computePositions, suggestTransfers, settleRound };
