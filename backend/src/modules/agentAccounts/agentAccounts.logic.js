'use strict';

// Sprint052 - pure agent-account rules (no DB), unit tested in test/agentAccounts.test.js.
// Sign convention for an agent position, in minor units of ONE currency:
//   positive = the agent owes us, negative = we owe the agent.

const DAY = 24 * 60 * 60 * 1000;

/** Account effect on the agent position for a journal line. */
const positionDelta = (accountCode, debitMinor, creditMinor) => {
  const net = (debitMinor || 0) - (creditMinor || 0); // debit-positive
  // 1100 receivable / 1110 advances: debit = they owe us (+). 2000 payable: credit = we owe
  // them, i.e. a negative debit-positive net, which is already the right sign for the position.
  if (accountCode === '1100' || accountCode === '1110' || accountCode === '2000') return net;
  return 0;
};

/**
 * Running statement. lines: [{ date, accountCode, debitMinor, creditMinor, ...any }] sorted here by date.
 * Returns rows with `deltaMinor` and `balanceMinor` plus the closing position.
 */
const buildStatementRows = (lines) => {
  const rows = [...lines]
    .map((l) => ({ ...l, deltaMinor: positionDelta(l.accountCode, l.debitMinor, l.creditMinor) }))
    .filter((r) => r.deltaMinor !== 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  let bal = 0;
  for (const r of rows) { bal += r.deltaMinor; r.balanceMinor = bal; }
  return { rows, closingMinor: bal };
};

/**
 * Ageing of open invoices by days past due date (not-yet-due counts in 0-30).
 * invoices: [{ dueDate, balanceMinor }]
 */
const ageingBuckets = (invoices, now = new Date()) => {
  const b = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const inv of invoices) {
    if (!(inv.balanceMinor > 0)) continue;
    const days = Math.floor((now - new Date(inv.dueDate)) / DAY);
    const k = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
    b[k] += inv.balanceMinor;
  }
  return b;
};

/**
 * Netting allocation: spend up to `payableMinor` across open invoices.
 *  strategy 'oldest'    - oldest due date first
 *  strategy 'sameRound' - invoices of `roundId` first, then oldest (only that round if onlyRound)
 * invoices: [{ id, dueDate, roundId, balanceMinor }]
 */
const allocateOffset = (payableMinor, invoices, { strategy = 'oldest', roundId = null } = {}) => {
  let left = Math.max(0, payableMinor);
  const open = invoices.filter((i) => i.balanceMinor > 0);
  const byDue = (a, b) => new Date(a.dueDate) - new Date(b.dueDate);
  let ordered;
  if (strategy === 'sameRound') {
    const same = open.filter((i) => String(i.roundId) === String(roundId)).sort(byDue);
    ordered = same; // same-round only: costs of a round clear that round's invoices
  } else {
    ordered = [...open].sort(byDue);
  }
  const out = [];
  for (const inv of ordered) {
    if (left <= 0) break;
    const amt = Math.min(left, inv.balanceMinor);
    out.push({ invoiceId: inv.id, amountMinor: amt });
    left -= amt;
  }
  return { allocations: out, appliedMinor: out.reduce((a, x) => a + x.amountMinor, 0), unusedMinor: left };
};

/**
 * Final settlement statement from per-category amounts (all >= 0, minor units).
 * Net = receivable side - payable side. Positive net = agent pays us.
 */
const buildSettlement = ({ invoices = 0, advances = 0, costs = 0, handling = 0, commission = 0, receipts = 0 }) => {
  const lines = [
    { kind: 'Invoice', amountMinor: invoices },
    { kind: 'Advance', amountMinor: advances },
    { kind: 'Receipts', amountMinor: -receipts },
    { kind: 'Cost', amountMinor: -costs },
    { kind: 'Handling', amountMinor: -handling },
    { kind: 'Commission', amountMinor: -commission },
  ].filter((l) => l.amountMinor !== 0);
  const netMinor = lines.reduce((a, l) => a + l.amountMinor, 0);
  return { lines, netMinor, direction: netMinor > 0 ? 'AgentPaysUs' : netMinor < 0 ? 'WePayAgent' : 'Even' };
};

/** Handling charges to create for bookings, given an agreement fee table. Pure and idempotent. */
const planHandling = (bookings, fees, existingKeys = new Set()) => {
  const feeOf = (move, status) => fees.find((f) => f.moveType === move && f.containerStatus === status)?.amountMinor;
  const charges = [];
  const unpriced = [];
  for (const b of bookings) {
    const moves = [];
    if (b.status === 'Final Loading') moves.push('Load');
    if (b.dischargeStatus === 'Discharged') moves.push('Discharge');
    for (const m of moves) {
      if (existingKeys.has(`${b._id}|${m}`)) continue;
      const fee = b.containerStatus ? feeOf(m, b.containerStatus) : undefined;
      if (fee === undefined) { unpriced.push({ bookingId: b._id, moveType: m, containerStatus: b.containerStatus || null }); continue; }
      charges.push({ bookingId: b._id, voyageId: b.voyageId, moveType: m, containerStatus: b.containerStatus, amountMinor: fee });
    }
  }
  return { charges, unpriced, totalMinor: charges.reduce((a, c) => a + c.amountMinor, 0) };
};

/**
 * Categorise an agent's ledger lines for one Round into settlement-statement lines.
 * lines: [{ accountCode, sourceType (ORIGINAL source; reversals resolved by the caller), debitMinor, creditMinor }]
 * Every amount is a signed position delta (positive = agent owes us), so the sum IS the closing position.
 */
const categorizeLines = (lines) => {
  const kindOf = (code, src) => {
    if (code === '1100') return src === 'Settlement' ? 'Receipts' : 'Invoice';
    if (code === '1110') return 'Advance';
    if (code === '2000') {
      if (src === 'Expense') return 'Cost';
      if (src === 'HandlingFee') return 'Handling';
      if (src === 'Commission') return 'Commission';
      return 'PaidOrOffset';
    }
    return null;
  };
  const order = ['Invoice', 'Advance', 'Receipts', 'Cost', 'Handling', 'Commission', 'PaidOrOffset'];
  const sums = {};
  for (const l of lines) {
    const kind = kindOf(l.accountCode, l.sourceType);
    if (!kind) continue;
    sums[kind] = (sums[kind] || 0) + positionDelta(l.accountCode, l.debitMinor, l.creditMinor);
  }
  const out = order.filter((k) => sums[k]).map((k) => ({ kind: k, amountMinor: sums[k] }));
  const netMinor = out.reduce((a, l) => a + l.amountMinor, 0);
  return { lines: out, netMinor, direction: netMinor > 0 ? 'AgentPaysUs' : netMinor < 0 ? 'WePayAgent' : 'Even' };
};

module.exports = { categorizeLines, positionDelta, buildStatementRows, ageingBuckets, allocateOffset, buildSettlement, planHandling };

/** Ledger expense account for an ExpenseType (name first, then category). */
const expenseAccountCode = ({ name = '', category = '' } = {}) => {
  const n = String(name).toLowerCase();
  if (/hire/.test(n)) return '5100';
  if (/handling/.test(n)) return '5300';
  if (/agency/.test(n)) return '5200';
  if (/commission/.test(n)) return '5400';
  if (String(category).toLowerCase() === 'port expense') return '5000';
  return '5900';
};

module.exports.expenseAccountCode = expenseAccountCode;
