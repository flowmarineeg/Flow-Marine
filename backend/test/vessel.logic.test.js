'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/modules/vessels/vessel.logic');

const NOW = new Date('2026-10-25T00:00:00Z');
const day = (n) => new Date(NOW.getTime() + n * 86400000);

test('missingRequired: owned vessel', () => {
  assert.deepEqual(L.missingRequired({ vesselName: 'A', imoNumber: '1234567', callSign: 'X', capacity: 100, ownershipType: 'Owned', defaultDailyHireRateMinor: 0 }), []);
  assert.deepEqual(L.missingRequired({ vesselName: 'A', imoNumber: '1234567', ownershipType: 'Owned' }), ['callSign', 'capacity', 'defaultDailyHireRate']);
});

test('missingRequired: charter types need both dates', () => {
  const base = { vesselName: 'A', imoNumber: '1234567', callSign: 'X', capacity: 1, defaultDailyHireRateMinor: 5, ownershipType: 'Time Charter' };
  assert.deepEqual(L.missingRequired(base), ['charterStartDate', 'charterEndDate']);
  assert.deepEqual(L.missingRequired({ ...base, charterStartDate: day(-1), charterEndDate: day(5) }), []);
  assert.deepEqual(L.missingRequired({ ...base, ownershipType: 'Owned' }), []);
});

test('redeliveryAlert: 30-day window', () => {
  const v = (n, t = 'Time Charter') => ({ ownershipType: t, charterEndDate: day(n) });
  assert.equal(L.redeliveryAlert(v(31), NOW), null);
  assert.equal(L.redeliveryAlert(v(30), NOW).daysLeft, 30);
  assert.equal(L.redeliveryAlert(v(30), NOW).level, 'red');
  assert.equal(L.redeliveryAlert(v(0), NOW).daysLeft, 0);
  assert.equal(L.redeliveryAlert(v(-3), NOW).daysLeft, -3);
  assert.match(L.redeliveryAlert(v(-3), NOW).message, /passed 3 day/);
  assert.equal(L.redeliveryAlert(v(5, 'Owned'), NOW), null);
  assert.equal(L.redeliveryAlert({ ownershipType: 'Voyage Charter' }, NOW), null);
});

test('hire rate conversion', () => {
  assert.equal(L.hireRateToMinor('12500.50'), 1250050);
  assert.equal(L.hireRateToMinor(8000), 800000);
  assert.equal(L.hireRateToMinor(''), null);
  assert.equal(L.hireRateFromMinor(1250050), '12500.50');
  assert.equal(L.hireRateFromMinor(null), null);
  assert.throws(() => L.hireRateToMinor('abc'), TypeError);
});

test('charterDateError', () => {
  assert.equal(L.charterDateError(day(0), day(1)), null);
  assert.ok(L.charterDateError(day(1), day(1)));
  assert.equal(L.charterDateError(null, day(1)), null);
});

test('present adds derived fields', () => {
  const p = L.present({ vesselName: 'A', ownershipType: 'Owned', defaultDailyHireRateMinor: 1000 }, NOW);
  assert.equal(p.defaultDailyHireRate, '10.00');
  assert.equal(p.redeliveryAlert, null);
  assert.ok(p.incompleteFields.includes('callSign'));
});
