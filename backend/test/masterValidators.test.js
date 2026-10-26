'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/utils/masterValidators');

test('isIban: valid and invalid', () => {
  assert.equal(v.isIban('GB82 WEST 1234 5698 7654 32'), true);
  assert.equal(v.isIban('DE89370400440532013000'), true);
  assert.equal(v.isIban('GB82WEST12345698765433'), false); // bad checksum
  assert.equal(v.isIban('12345'), false);
});

test('isSwift: 8 or 11 chars', () => {
  assert.equal(v.isSwift('DEUTDEFF'), true);
  assert.equal(v.isSwift('deutdeff500'), true);
  assert.equal(v.isSwift('DEUTDEF'), false);
  assert.equal(v.isSwift('1234DEFF'), false);
});

test('isUnLocode', () => {
  assert.equal(v.isUnLocode('EGALY'), true);
  assert.equal(v.isUnLocode('eg aly'), true);
  assert.equal(v.isUnLocode('EGAL'), false);
  assert.equal(v.isUnLocode('1GALY'), false);
});

test('isIsoContainerCode', () => {
  assert.equal(v.isIsoContainerCode('22G1'), true);
  assert.equal(v.isIsoContainerCode('45G1'), true);
  assert.equal(v.isIsoContainerCode('42R1'), true);
  assert.equal(v.isIsoContainerCode('2G1'), false);
  assert.equal(v.isIsoContainerCode('22GG'), false);
});

test('isCurrencyCode / isEmail', () => {
  assert.equal(v.isCurrencyCode('usd'), true);
  assert.equal(v.isCurrencyCode('US'), false);
  assert.equal(v.isEmail('a@b.co'), true);
  assert.equal(v.isEmail('a@b'), false);
});

test('teuFactorForSize mirrors the engine sizes', () => {
  assert.equal(v.teuFactorForSize('20ft'), 1);
  assert.equal(v.teuFactorForSize('40ft'), 2);
  assert.equal(v.teuFactorForSize('40HC'), 2);
  assert.equal(v.teuFactorForSize('45ft'), 2);
});

test('contactFromLegacy (partner backfill)', () => {
  const { contactFromLegacy } = require('../src/config/migrations/migrate-masterdata');
  assert.equal(contactFromLegacy(null), null);
  assert.equal(contactFromLegacy({ person: null, email: null, phone: null }), null);
  assert.deepEqual(contactFromLegacy({ person: 'Ann', email: 'a@b.co', phone: '1' }), { name: 'Ann', title: null, email: 'a@b.co', phone: '1' });
  assert.equal(contactFromLegacy({ email: 'a@b.co' }).name, 'a@b.co');
});

test('isBookingSource: only explicit Port-only agents are excluded', () => {
  const { isBookingSource } = require('../src/modules/agents/agent.logic');
  assert.equal(isBookingSource({ roles: [] }), true);        // older agents
  assert.equal(isBookingSource({}), true);
  assert.equal(isBookingSource({ roles: ['Commercial'] }), true);
  assert.equal(isBookingSource({ roles: ['Commercial', 'Port'] }), true);
  assert.equal(isBookingSource({ roles: ['Port'] }), false);
  assert.equal(isBookingSource(null), true);
});

test('customer list query: type filter is part of the Mongo query', () => {
  const { buildListQuery } = require('../src/modules/customers/customer.logic');
  assert.deepEqual(buildListQuery({}), {});
  assert.deepEqual(buildListQuery({ customerType: 'NVOCC' }), { customerType: 'NVOCC' });
  assert.deepEqual(buildListQuery({ customerType: 'all' }), {});   // All Types
  assert.deepEqual(buildListQuery({ customerType: '' }), {});
  assert.deepEqual(buildListQuery({ customerType: '$ne' }), {});   // unknown value never reaches the query
  const q = buildListQuery({ search: 'a.b', status: 'Active', customerType: 'Freight Forwarder' });
  assert.equal(q.status, 'Active');
  assert.equal(q.customerType, 'Freight Forwarder');
  assert.equal(q.$or.length, 2);
  assert.ok(q.$or[0].customerName.$regex.includes('a\\.b')); // regex input is escaped
});
