'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateShares } = require('../src/modules/partners/vesselShares');
const { countDependents } = require('../src/utils/dependents');

const S = (partnerId, shareBp, isLead = false) => ({ partnerId, shareBp, isLead });

test('50/30/20 with one lead is valid', () => {
  assert.doesNotThrow(() => validateShares([S('a', 5000, true), S('b', 3000), S('c', 2000)]));
});

test('total not 100% -> SHARES_NOT_100', () => {
  assert.throws(() => validateShares([S('a', 5000, true), S('b', 3000)]), { code: 'SHARES_NOT_100' });
  assert.throws(() => validateShares([S('a', 6000, true), S('b', 5000)]), { code: 'SHARES_NOT_100' });
  assert.throws(() => validateShares([]), { code: 'SHARES_NOT_100' });
});

test('exactly one lead is required', () => {
  assert.throws(() => validateShares([S('a', 5000, true), S('b', 5000, true)]), { code: 'LEAD_COUNT_INVALID' });
  assert.throws(() => validateShares([S('a', 5000), S('b', 5000)]), { code: 'LEAD_COUNT_INVALID' });
});

test('duplicate partner and non-integer share are rejected', () => {
  assert.throws(() => validateShares([S('a', 5000, true), S('a', 5000)]), { code: 'DUPLICATE_PARTNER' });
  assert.throws(() => validateShares([S('a', 5000.5, true), S('b', 4999.5)]), { code: 'SHARE_INVALID' });
});

test('dependents: unregistered collections are skipped', async () => {
  const out = await countDependents('x', [{ model: 'NoSuchModel', field: 'a', label: 'ghosts' }]);
  assert.deepEqual(out, []);
});
