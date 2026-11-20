'use strict';

// F-09 (owner decision B): roles and permissions are written by the SuperAdmin only.
const test = require('node:test');
const assert = require('node:assert/strict');
const superAdminOnly = require('../src/middleware/superAdminOnly');

const run = (user) => {
  const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let nextCalled = false;
  superAdminOnly({ user }, res, () => { nextCalled = true; });
  return { res, nextCalled };
};

test('F-09: the system role passes; a role holding roles:update, a partner user and a missing user do not', () => {
  assert.equal(run({ roleId: { isSystem: true } }).nextCalled, true);
  const staff = run({ roleId: { isSystem: false, _id: 'r1' } });
  assert.equal(staff.nextCalled, false);
  assert.equal(staff.res.code, 403);
  assert.match(staff.res.body.message, /Only the SuperAdmin/);
  assert.equal(run({ roleId: { isPartnerRole: true } }).nextCalled, false);
  assert.equal(run({ roleId: 'plain-id-string' }).nextCalled, false);
  assert.equal(run(undefined).res.code, 403);
});
