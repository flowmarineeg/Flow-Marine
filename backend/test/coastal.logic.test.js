'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LANDLOCKED_COUNTRY_CODES, ESTUARY_PORT_CODES, isLandlockedCountry, portReviewFlags, coastalCountryError,
} = require('../src/modules/locations/coastal.logic');

test('44 landlocked countries, no duplicates, Caspian-only states included', () => {
  assert.equal(LANDLOCKED_COUNTRY_CODES.length, 44);
  assert.equal(new Set(LANDLOCKED_COUNTRY_CODES).size, 44);
  for (const c of ['AZ', 'KZ', 'TM', 'XK', 'SS']) assert.equal(isLandlockedCountry(c), true, c);
});

test('coastal countries are not landlocked (incl. lower-case input)', () => {
  for (const c of ['EG', 'SA', 'CN', 'SG', 'AE', 'PK', 'DJ', 'ru', 'ir']) assert.equal(isLandlockedCountry(c), false, c);
  assert.equal(isLandlockedCountry('ch'), true);
  assert.equal(isLandlockedCountry(null), false);
});

test('coastalCountryError refuses landlocked, accepts coastal', () => {
  assert.match(coastalCountryError({ name: 'Switzerland', code: 'CH' }), /Switzerland is landlocked/);
  assert.equal(coastalCountryError({ name: 'Egypt', code: 'EG' }), null);
  assert.equal(coastalCountryError(null), null);
});

test('far-inland river ports are not on the estuary list; ocean-called ones are', () => {
  for (const c of ['CNWUH', 'CNCKG', 'CNNKG']) assert.equal(ESTUARY_PORT_CODES[c], undefined, c);
  for (const c of ['CNSHA', 'DEHAM', 'NLRTM']) assert.ok(ESTUARY_PORT_CODES[c], c);
});

test('portReviewFlags: estuary, probe, suspect code, non-sea name, clean', () => {
  assert.match(portReviewFlags({ name: 'Shanghai', code: 'CNSHA' })[0], /estuary/);
  assert.match(portReviewFlags({ name: 'E2E Port ABC', code: null })[0], /probe/);
  assert.match(portReviewFlags({ name: 'Karachi port', code: 'PKKHA' })[0], /PKKHI/);
  assert.match(portReviewFlags({ name: 'Mekong River Terminal', code: null })[0], /river/);
  assert.deepEqual(portReviewFlags({ name: 'Jebel Ali', code: 'AEJEA' }), []);
  assert.deepEqual(portReviewFlags({}), []);
});
