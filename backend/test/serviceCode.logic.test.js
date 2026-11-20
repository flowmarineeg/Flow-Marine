'use strict';

// RV-40: service code lock (pure rule)
const test = require('node:test');
const assert = require('node:assert/strict');
const { codeChanged, lockedMessage } = require('../src/modules/services/serviceCode.logic');

test('RV-40: only a real change of the code counts (case and spaces ignored); blank or missing is no change', () => {
  assert.equal(codeChanged('GMED', 'GMED'), false);
  assert.equal(codeChanged('GMED', 'gmed'), false);
  assert.equal(codeChanged('GMED', ' gmed '), false);
  assert.equal(codeChanged('GMED', 'GMD2'), true);
  assert.equal(codeChanged('GMED', undefined), false);
  assert.equal(codeChanged('GMED', null), false);
  assert.equal(codeChanged('GMED', ''), false);
  assert.equal(codeChanged(undefined, 'NEW'), true);
});

test('RV-40: the message appears only when rounds use the service, with the right plural', () => {
  assert.equal(lockedMessage('GMED', 0), null);
  assert.match(lockedMessage('GMED', 1), /1 round already use it/);
  assert.match(lockedMessage('GMED', 3), /3 rounds already use it/);
  assert.match(lockedMessage('GMED', 3), /name can still be edited/);
});
