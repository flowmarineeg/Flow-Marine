'use strict';

// BK-05: move rules (pure)
const test = require('node:test');
const assert = require('node:assert/strict');
const Mv = require('../src/modules/bookings/moveRules.logic');

test('move: only Pending / Confirmed move; same voyage, other round, missing target and partner users are refused', () => {
  const ok = { status: 'Pending', currentVoyageId: 'a', targetVoyageId: 'b', currentRoundId: 'r', targetRoundId: 'r' };
  assert.equal(Mv.moveError(ok), null);
  assert.equal(Mv.moveError({ ...ok, status: 'Confirmed' }), null);
  assert.equal(Mv.moveError({ ...ok, status: 'Final Loading' }).code, 'MOVE_STATUS');
  assert.equal(Mv.moveError({ ...ok, status: 'Cancelled' }).code, 'MOVE_STATUS');
  assert.equal(Mv.moveError({ ...ok, targetVoyageId: 'a' }).code, 'MOVE_SAME');
  assert.equal(Mv.moveError({ ...ok, targetRoundId: 'other' }).code, 'MOVE_ROUND');
  assert.equal(Mv.moveError({ ...ok, targetVoyageId: '' }).code, 'MOVE_TARGET');
  assert.equal(Mv.moveError({ ...ok, isPartnerUser: true }).status, 403);
});
