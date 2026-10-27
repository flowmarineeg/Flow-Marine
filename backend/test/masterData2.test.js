'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('chart file: valid, 158 accounts, headers never posting', () => {
  const chart = require('../src/modules/ledger/chart.6digit.json');
  const { validateChart, toAccountFields } = require('../src/modules/accounting/chart.logic');
  assert.deepEqual(validateChart(chart), []);
  assert.equal(chart.length, 158);
  const rows = chart.map(toAccountFields);
  assert.ok(rows.every((r) => ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].includes(r.type)));
  assert.ok(rows.filter((r) => r.isGroup).every((r) => !r.isPosting));
  assert.equal(rows.filter((r) => r.isPosting).length, 108);
});

test('chart validation catches bad rows', () => {
  const { validateChart } = require('../src/modules/accounting/chart.logic');
  const bad = [
    { code: '12', account_type: 'ASSET' },
    { code: '100000', account_type: 'NOPE' },
    { code: '100000', account_type: 'ASSET', parent_code: '999999', is_group: true, is_posting: true },
  ];
  const errs = validateChart(bad).join('|');
  assert.match(errs, /6 digits/);
  assert.match(errs, /unknown account_type/);
  assert.match(errs, /duplicate code/);
  assert.match(errs, /both group and posting/);
  assert.match(errs, /parent 999999 missing/);
});

test('account rules: header and non-posting accounts are never selectable', () => {
  const { accountMatches } = require('../src/modules/ledger/accountRules');
  assert.equal(accountMatches({ type: 'Revenue', code: '411101', isPosting: true }, 'revenue'), true);
  assert.equal(accountMatches({ type: 'Revenue', code: '410000', isGroup: true, isPosting: false }, 'revenue'), false);
  assert.equal(accountMatches({ type: 'Revenue', code: '4000' }, 'revenue'), true); // legacy 4-digit row
  assert.equal(accountMatches({ type: 'Asset', code: '112101', isPosting: true }, 'receivable'), true);
});

test('charter history: decimals to minor units, ordering and bad data', () => {
  const L = require('../src/modules/vessels/vessel.logic');
  const [e] = L.prepareCharterHistory([{ charterPartyDate: '2026-01-01', deliveryDate: '2026-02-01', deliveryPrice: '12000.5', redeliveryDate: '2027-02-01' }]);
  assert.equal(e.deliveryPriceMinor, 1200050);
  assert.equal(L.presentCharterEntry(e).deliveryPrice, '12000.50');
  assert.throws(() => L.prepareCharterHistory([{ deliveryDate: '2026-02-01' }]), /dates are required/);
  assert.throws(() => L.prepareCharterHistory([{ deliveryDate: '2026-02-01', redeliveryDate: '2026-01-01' }]), /after delivery/);
  assert.throws(() => L.prepareCharterHistory([{ deliveryDate: '2026-01-01', redeliveryDate: '2026-02-01', deliveryPrice: 'abc' }]), /valid amount/);
  assert.deepEqual(L.prepareCharterHistory(undefined), []);
});

test('charter history: the newest entry is the latest', () => {
  const L = require('../src/modules/vessels/vessel.logic');
  assert.equal(L.latestCharter([]), null);
  assert.equal(L.latestCharter([{ a: 1 }, { a: 2 }]).a, 2);
  const out = L.present({ ownershipType: 'Time Charter', charterHistory: [{ deliveryDate: 'x', deliveryPriceMinor: 500 }] });
  assert.equal(out.charterHistory[0].deliveryPrice, '5.00');
});

test('seed-locations: unique city names, trimmed, case-insensitive, <=100 chars', () => {
  const { uniqueCityNames } = require('../src/config/migrations/seed-locations');
  assert.deepEqual(uniqueCityNames([{ name: ' Cairo ' }, { name: 'cairo' }, { name: '' }, { name: 'Giza' }, { name: 'x'.repeat(101) }]), ['Cairo', 'Giza']);
});

test('bank account rows: IBAN / SWIFT format helpers', () => {
  const v = require('../src/utils/masterValidators');
  assert.equal(v.isIban('GB82 WEST 1234 5698 7654 32'), true);
  assert.equal(v.isIban('GB82 WEST 1234 5698 7654 33'), false);
  assert.equal(v.isSwift('NBEGEGCX'), true);
  assert.equal(v.isSwift('BAD'), false);
  const { bankAccountSchema } = require('../src/utils/bankAccounts');
  assert.ok(bankAccountSchema.path('bankName').isRequired);
  assert.ok(bankAccountSchema.path('usdIban') && bankAccountSchema.path('swiftCode') && bankAccountSchema.path('usdAccountNumber'));
});

test('invoice service model: all four invoice fields required', () => {
  const M = require('../src/modules/invoiceServices/invoiceService.model');
  const err = new M({}).validateSync();
  for (const f of ['serviceName', 'applicability', 'isTaxable', 'revenueAccountId']) assert.ok(err.errors[f], `${f} should be required`);
});

test('agent model: bank rows, registration and tax number exist; roles are not writable through the service', () => {
  const Agent = require('../src/modules/agents/agent.model');
  assert.ok(Agent.schema.path('bankAccounts') && Agent.schema.path('registrationNumber') && Agent.schema.path('taxId'));
  const src = require('fs').readFileSync(require.resolve('../src/modules/agents/agent.service'), 'utf8');
  assert.match(src, /NOT_WRITABLE = \['roles', 'partyType'/);
});
