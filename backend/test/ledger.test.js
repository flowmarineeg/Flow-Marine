'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertBalanced } = require('../src/modules/ledger/ledger.service');
const JournalEntry = require('../src/modules/ledger/journalEntry.model');
const JournalEntryLine = require('../src/modules/ledger/journalEntryLine.model');

const L = (debitMinor, creditMinor, currency = 'USD') => ({ accountCode: '1100', debitMinor, creditMinor, currency });

test('balanced entry passes', () => {
  assert.doesNotThrow(() => assertBalanced([L(10000, 0), L(0, 10000)], 'USD'));
  assert.doesNotThrow(() => assertBalanced([L(300, 0), L(200, 0), L(0, 500)], 'USD'));
});

test('unbalanced entry is rejected with LEDGER_UNBALANCED', () => {
  assert.throws(() => assertBalanced([L(10000, 0), L(0, 9999)], 'USD'), { code: 'LEDGER_UNBALANCED' });
  assert.throws(() => assertBalanced([L(100, 0)], 'USD'), { code: 'LEDGER_UNBALANCED' });
});

test('balance is checked per currency', () => {
  assert.throws(() => assertBalanced([L(100, 0, 'USD'), L(0, 100, 'EUR')], 'USD'), { code: 'LEDGER_UNBALANCED' });
});

test('a line must be debit XOR credit, integer, positive', () => {
  assert.throws(() => assertBalanced([L(100, 100), L(0, 0)], 'USD'), { code: 'LEDGER_BAD_LINE' });
  assert.throws(() => assertBalanced([L(0, 0), L(0, 0)], 'USD'), { code: 'LEDGER_BAD_LINE' });
  assert.throws(() => assertBalanced([L(10.5, 0), L(0, 10.5)], 'USD'), TypeError);
});

test('ledger models refuse update and delete (R3)', async () => {
  for (const M of [JournalEntry, JournalEntryLine]) {
    await assert.rejects(M.updateOne({}, { $set: { memo: 'x' } }), { code: 'LEDGER_IMMUTABLE' });
    await assert.rejects(M.updateMany({}, { $set: { memo: 'x' } }), { code: 'LEDGER_IMMUTABLE' });
    await assert.rejects(M.findOneAndUpdate({}, { $set: { memo: 'x' } }), { code: 'LEDGER_IMMUTABLE' });
    await assert.rejects(M.deleteOne({}), { code: 'LEDGER_IMMUTABLE' });
    await assert.rejects(M.deleteMany({}), { code: 'LEDGER_IMMUTABLE' });
    await assert.rejects(M.findOneAndDelete({}), { code: 'LEDGER_IMMUTABLE' });
  }
});

test('saving an already-persisted ledger document is refused', async () => {
  const e = new JournalEntry({
    entryNumber: 'JE-1', date: new Date(), sourceType: 'Manual', currency: 'USD',
  });
  e.isNew = false;
  await assert.rejects(e.save(), { code: 'LEDGER_IMMUTABLE' });
});
