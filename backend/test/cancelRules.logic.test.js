'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isCancelOnly } = require('../src/modules/bookings/cancelRules.logic');

test('FL-05: only a status-only Cancelled request may touch a Final Loading booking', () => {
  assert.equal(isCancelOnly({ status: 'Cancelled' }), true);
  assert.equal(isCancelOnly({ status: 'Cancelled', remarks: 'x' }), false);   // anything else rides along: refused
  assert.equal(isCancelOnly({ status: 'Confirmed' }), false);
  assert.equal(isCancelOnly({ shipper: 'A' }), false);
  assert.equal(isCancelOnly({}), false);
  assert.equal(isCancelOnly(null), false);
  assert.equal(isCancelOnly(undefined), false);
});
