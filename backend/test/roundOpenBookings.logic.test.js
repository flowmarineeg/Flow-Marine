'use strict';

// FL-06: refuse Completed while Pending / Confirmed bookings exist (pure message rule)
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/modules/rounds/round.logic');

test('FL-06: open = Pending or Confirmed only; the refusal message names both layers; no open bookings = no message', () => {
  assert.deepEqual([...R.OPEN_BOOKING_STATUSES], ['Pending', 'Confirmed']);
  assert.ok(!R.OPEN_BOOKING_STATUSES.includes('Final Loading'));
  assert.ok(!R.OPEN_BOOKING_STATUSES.includes('Cancelled'));
  assert.equal(R.openBookingsMessage('R000001', 0, 0), null);
  const m = R.openBookingsMessage('R000001', 2, 1);
  assert.match(m, /R000001/);
  assert.match(m, /2 booking\(s\) and 1 estimated booking\(s\)/);
  assert.match(R.openBookingsMessage('R000001', 0, 3), /0 booking\(s\) and 3 estimated/);
});
