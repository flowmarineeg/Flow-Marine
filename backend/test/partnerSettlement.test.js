'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/modules/partnerSettlement/partnerSettlement.logic');
const { toMinor } = require('../src/utils/money');

const M = (s) => toMinor(s);
const shares = [
  { partnerId: 'A', shareBp: 5000 }, { partnerId: 'B', shareBp: 3000 }, { partnerId: 'C', shareBp: 2000 },
];
// Proposal section 8: revenue 300,000, expenses 200,000. B paid 120,000 hire directly.
// A collected 150,000, C collected 70,000, 80,000 offset against the port agent.
const ledger = (extra = []) => [
  { accountCode: '4000', creditMinor: M('300000') },
  { accountCode: '5100', debitMinor: M('120000') },
  { accountCode: '5000', debitMinor: M('80000') },
  ...extra,
];
const paid = { B: M('120000') };
const coll = { A: M('150000'), C: M('70000') };

test('example 1 (proposal 8): A pays 100,000, B receives 150,000, C pays 50,000 - to the cent', () => {
  const r = P.settleRound({ lines: ledger(), mode: 'Accrual', shares, paidDirect: paid, collectedDirect: coll });
  assert.equal(r.profitMinor, M('100000'));
  const net = Object.fromEntries(r.positions.map((p) => [p.partnerId, p.netMinor]));
  assert.deepEqual(net, { A: -M('100000'), B: M('150000'), C: -M('50000') });
  assert.equal(r.positions.reduce((a, p) => a + p.netMinor, 0), 0);
  const t = [...r.transfers].sort((x, y) => x.fromPartnerId.localeCompare(y.fromPartnerId));
  assert.deepEqual(t, [
    { fromPartnerId: 'A', toPartnerId: 'B', amountMinor: M('100000') },
    { fromPartnerId: 'C', toPartnerId: 'B', amountMinor: M('50000') },
  ]);
  assert.deepEqual(r.held, []);
});

test('example 2 (unpaid invoices): cash mode profit excludes the receivable not yet collected', () => {
  // 80,000 of the revenue is still outstanding as an agent receivable (1100 debit balance).
  const lines = ledger([{ accountCode: '1100', debitMinor: M('80000') }]);
  const accrual = P.computeProfit(lines, 'Accrual');
  const cash = P.computeProfit(lines, 'Cash');
  assert.equal(accrual.profitMinor, M('100000'));
  assert.equal(cash.profitMinor, M('20000'));
  assert.equal(cash.revenueMinor, M('220000'));
  // cash distribution: 20,000 -> A 10,000, B 6,000, C 4,000
  const r = P.settleRound({ lines, mode: 'Cash', shares, paidDirect: paid, collectedDirect: { A: M('150000'), C: M('70000') } });
  assert.deepEqual(r.positions.map((p) => p.shareMinor), [M('10000'), M('6000'), M('4000')]);
  assert.equal(r.positions.reduce((a, p) => a + p.shareMinor, 0), M('20000'));
});

test('example 3 (carry forward): 20,000 held back as JV reserve', () => {
  const r = P.settleRound({ lines: ledger(), mode: 'Accrual', shares, paidDirect: paid, collectedDirect: coll, carryMinor: M('20000') });
  assert.equal(r.distributableMinor, M('80000'));
  assert.deepEqual(r.positions.map((p) => p.shareMinor), [M('40000'), M('24000'), M('16000')]);
  const net = Object.fromEntries(r.positions.map((p) => [p.partnerId, p.netMinor]));
  assert.deepEqual(net, { A: -M('110000'), B: M('144000'), C: -M('54000') });
  // B is paid in full; the 20,000 the partners still hold is the reserve
  const toB = r.transfers.reduce((a, t) => a + t.amountMinor, 0);
  assert.equal(toB, M('144000'));
  assert.equal(r.held.reduce((a, h) => a + h.heldMinor, 0), M('20000'));
});

test('shares never lose a cent on an awkward profit', () => {
  const s3 = [{ partnerId: 'A', shareBp: 3333 }, { partnerId: 'B', shareBp: 3333 }, { partnerId: 'C', shareBp: 3334 }];
  for (const profit of [1, 2, 100, 99999, 1234567]) {
    assert.equal(P.shareProfit(profit, s3).reduce((a, x) => a + x.shareMinor, 0), profit);
  }
});

test('a loss is shared the same way and carry cannot exceed profit', () => {
  const lines = [{ accountCode: '4000', creditMinor: M('1000') }, { accountCode: '5000', debitMinor: M('1500') }];
  const r = P.settleRound({ lines, mode: 'Accrual', shares });
  assert.equal(r.profitMinor, -M('500'));
  assert.equal(r.positions.reduce((a, p) => a + p.shareMinor, 0), -M('500'));
  assert.throws(() => P.settleRound({ lines: ledger(), mode: 'Accrual', shares, carryMinor: M('200000') }), RangeError);
});
