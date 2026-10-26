'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/modules/expenseTypes/expenseType.logic');
const { accountMatches } = require('../src/modules/ledger/accountRules');

test('scopeAllowed per level', () => {
  assert.equal(L.scopeAllowed('ROUND_LEVEL', 'Round'), true);
  assert.equal(L.scopeAllowed('ROUND_LEVEL', 'Voyage'), false);
  assert.equal(L.scopeAllowed('VOYAGE_LEVEL', 'Voyage'), true);
  assert.equal(L.scopeAllowed('VOYAGE_LEVEL', 'Port'), true);
  assert.equal(L.scopeAllowed('VOYAGE_LEVEL', 'Round'), false);
  assert.equal(L.scopeAllowed('PORT_LEVEL', 'Port'), true);
  assert.equal(L.scopeAllowed('PORT_LEVEL', 'Voyage'), false);
  assert.equal(L.scopeAllowed(undefined, 'Voyage'), true); // unset level behaves as VOYAGE_LEVEL
});

test('scopeError message', () => {
  assert.equal(L.scopeError({ name: 'Hire', operationalLevel: 'ROUND_LEVEL' }, 'Round'), null);
  assert.match(L.scopeError({ name: 'Hire', operationalLevel: 'ROUND_LEVEL' }, 'Port'), /Round-level.*Port scope/);
});

test('resolveKind: requiresPda starts as PDA, explicit FDA refused', () => {
  assert.deepEqual(L.resolveKind({ requiresPda: false }, undefined), { kind: 'FDA', error: null });
  assert.deepEqual(L.resolveKind({ requiresPda: false }, 'PDA'), { kind: 'PDA', error: null });
  assert.deepEqual(L.resolveKind({ requiresPda: true }, undefined), { kind: 'PDA', error: null });
  assert.deepEqual(L.resolveKind({ requiresPda: true }, 'PDA'), { kind: 'PDA', error: null });
  assert.match(L.resolveKind({ name: 'Port DA', requiresPda: true }, 'FDA').error, /requires a provisional estimate/);
});

test('missingMappings: accrual only when PDA', () => {
  assert.deepEqual(L.missingMappings({ operationalLevel: 'ROUND_LEVEL', expenseAccountId: 'a' }), []);
  assert.deepEqual(L.missingMappings({ operationalLevel: 'ROUND_LEVEL', expenseAccountId: 'a', requiresPda: true }), ['accrualAccountId']);
  assert.deepEqual(L.missingMappings({}), ['operationalLevel', 'expenseAccountId']);
});

test('levelFromScopes: dominant scope, empty -> VOYAGE_LEVEL', () => {
  assert.equal(L.levelFromScopes({}), 'VOYAGE_LEVEL');
  assert.equal(L.levelFromScopes({ Round: 5 }), 'ROUND_LEVEL');
  assert.equal(L.levelFromScopes({ Round: 1, Port: 4 }), 'PORT_LEVEL');
  assert.equal(L.levelFromScopes({ Round: 2, Voyage: 2 }), 'VOYAGE_LEVEL'); // tie -> narrower
});

test('accountMatches by type + prefix', () => {
  assert.equal(accountMatches({ type: 'Revenue', code: '4000' }, 'revenue'), true);
  assert.equal(accountMatches({ type: 'Revenue', code: '4100', isActive: false }, 'revenue'), false);
  assert.equal(accountMatches({ type: 'Expense', code: '5100' }, 'revenue'), false);
  assert.equal(accountMatches({ type: 'Expense', code: '5100' }, 'expense'), true);
  assert.equal(accountMatches({ type: 'Liability', code: '2100' }, 'accrual'), true);
  assert.equal(accountMatches({ type: 'Liability', code: '2200' }, 'accrual'), false); // JV reserve is not an accrual
  assert.equal(accountMatches(null, 'revenue'), false);
});

test('expenseAccountCodeFor (backfill heuristic)', () => {
  const { expenseAccountCodeFor: f } = require('../src/config/migrations/migrate-masterdata');
  assert.equal(f({ name: 'Hire Rate', category: 'Hire' }), '5100');
  assert.equal(f({ name: 'Agency Fees', category: 'Agency' }), '5200');
  assert.equal(f({ name: 'Terminal Handling', category: 'Port Expense' }), '5300');
  assert.equal(f({ name: 'Port Dues', category: 'Port Expense' }), '5000');
  assert.equal(f({ name: 'Miscellaneous', category: 'Operations' }), '5900');
});
