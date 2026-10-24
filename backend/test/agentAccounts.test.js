'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/modules/agentAccounts/agentAccounts.logic');
const { toMinor } = require('../src/utils/money');

test('OGA final settlement example: 120,000 + 10,000 advance - 40,000 - 8,400 - 3,000 = OGA pays 78,600', () => {
  const s = A.buildSettlement({
    invoices: toMinor('120000'), advances: toMinor('10000'), costs: toMinor('40000'),
    handling: toMinor('4800') + toMinor('3000') + toMinor('600'), commission: toMinor('3000'),
  });
  assert.equal(s.netMinor, 7860000);
  assert.equal(s.direction, 'AgentPaysUs');
});

test('settlement direction when we owe the agent, and when even', () => {
  assert.equal(A.buildSettlement({ invoices: 1000, costs: 4000 }).direction, 'WePayAgent');
  assert.equal(A.buildSettlement({ invoices: 1000, costs: 1000 }).direction, 'Even');
});

test('netting example: 60,000 of costs clears INV-001 (60,000) in full', () => {
  const inv = [{ id: 'INV-001', dueDate: '2026-01-10', roundId: 'R1', balanceMinor: 6000000 }];
  const r = A.allocateOffset(6000000, inv, { strategy: 'oldest' });
  assert.deepEqual(r.allocations, [{ invoiceId: 'INV-001', amountMinor: 6000000 }]);
  assert.equal(r.unusedMinor, 0);
});

test('netting: oldest first, partial on the last, never exceeds payable', () => {
  const inv = [
    { id: 'B', dueDate: '2026-03-01', roundId: 'R2', balanceMinor: 500 },
    { id: 'A', dueDate: '2026-01-01', roundId: 'R1', balanceMinor: 700 },
  ];
  const r = A.allocateOffset(1000, inv, { strategy: 'oldest' });
  assert.deepEqual(r.allocations, [{ invoiceId: 'A', amountMinor: 700 }, { invoiceId: 'B', amountMinor: 300 }]);
  assert.equal(r.appliedMinor, 1000);
  assert.equal(A.allocateOffset(0, inv).allocations.length, 0);
});

test('netting sameRound only touches that round', () => {
  const inv = [
    { id: 'A', dueDate: '2026-01-01', roundId: 'R1', balanceMinor: 700 },
    { id: 'B', dueDate: '2026-03-01', roundId: 'R2', balanceMinor: 500 },
  ];
  const r = A.allocateOffset(2000, inv, { strategy: 'sameRound', roundId: 'R2' });
  assert.deepEqual(r.allocations, [{ invoiceId: 'B', amountMinor: 500 }]);
  assert.equal(r.unusedMinor, 1500);
});

test('statement running balance: invoices up, receipts and costs down', () => {
  const lines = [
    { date: '2026-01-01', accountCode: '1100', debitMinor: 12000, creditMinor: 0 },
    { date: '2026-01-05', accountCode: '2000', debitMinor: 0, creditMinor: 4000 },
    { date: '2026-01-09', accountCode: '1100', debitMinor: 0, creditMinor: 3000 },
    { date: '2026-01-10', accountCode: '1010', debitMinor: 3000, creditMinor: 0 },
  ];
  const s = A.buildStatementRows(lines);
  assert.deepEqual(s.rows.map((r) => r.balanceMinor), [12000, 8000, 5000]);
  assert.equal(s.closingMinor, 5000);
});

test('ageing buckets by days past due', () => {
  const now = new Date('2026-06-30');
  const b = A.ageingBuckets([
    { dueDate: '2026-07-10', balanceMinor: 100 }, { dueDate: '2026-06-01', balanceMinor: 200 },
    { dueDate: '2026-04-20', balanceMinor: 300 }, { dueDate: '2026-03-15', balanceMinor: 400 },
    { dueDate: '2025-01-01', balanceMinor: 500 }, { dueDate: '2026-01-01', balanceMinor: 0 },
  ], now);
  assert.deepEqual(b, { '0-30': 300, '31-60': 0, '61-90': 300, '90+': 900 });
});

test('handling plan: fees by move and full/empty, idempotent, unpriced reported', () => {
  const fees = [
    { moveType: 'Load', containerStatus: 'Full', amountMinor: 6000 },
    { moveType: 'Discharge', containerStatus: 'Empty', amountMinor: 3000 },
  ];
  const bks = [
    { _id: 1, voyageId: 'V', status: 'Final Loading', containerStatus: 'Full' },
    { _id: 2, voyageId: 'V', status: 'Final Loading', containerStatus: 'Empty', dischargeStatus: 'Discharged' },
    { _id: 3, voyageId: 'V', status: 'Final Loading', containerStatus: null },
  ];
  const p = A.planHandling(bks, fees);
  assert.equal(p.charges.length, 2);          // 1 Load Full, 2 Discharge Empty
  assert.equal(p.totalMinor, 9000);
  assert.equal(p.unpriced.length, 2);         // 2 Load Empty (no fee), 3 Load (no status)
  const again = A.planHandling(bks, fees, new Set(['1|Load', '2|Discharge']));
  assert.equal(again.charges.length, 0);
});

test('categorizeLines reproduces the OGA example from ledger lines (7,860,000 minor)', () => {
  const L = (accountCode, sourceType, debitMinor, creditMinor) => ({ accountCode, sourceType, debitMinor, creditMinor });
  const r = A.categorizeLines([
    L('1100', 'Invoice', 12000000, 0), L('1110', 'Settlement', 1000000, 0),
    L('2000', 'Expense', 0, 4000000), L('2000', 'HandlingFee', 0, 840000), L('2000', 'Commission', 0, 300000),
  ]);
  assert.equal(r.netMinor, 7860000);
  assert.equal(r.direction, 'AgentPaysUs');
  assert.deepEqual(r.lines.map((x) => x.kind), ['Invoice', 'Advance', 'Cost', 'Handling', 'Commission']);
});

test('categorizeLines: an offset (DR 2000 / CR 1100) leaves the net position unchanged', () => {
  const L = (accountCode, sourceType, debitMinor, creditMinor) => ({ accountCode, sourceType, debitMinor, creditMinor });
  const before = A.categorizeLines([L('1100', 'Invoice', 10000, 0), L('2000', 'Expense', 0, 6000)]);
  const after = A.categorizeLines([L('1100', 'Invoice', 10000, 0), L('2000', 'Expense', 0, 6000), L('2000', 'Settlement', 6000, 0), L('1100', 'Settlement', 0, 6000)]);
  assert.equal(before.netMinor, 4000);
  assert.equal(after.netMinor, 4000);
});
