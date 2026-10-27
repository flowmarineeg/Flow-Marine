'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Vessel = require('../src/modules/vessels/vessel.model');

// RV-00 regression: reeferPlugs is optional. No DB needed (validateSync).
const base = { vesselCode: 'V1', vesselName: 'MV Test', imoNumber: '9000001', ownershipType: 'Owned' };
const errorPaths = (doc) => Object.keys(doc.validateSync()?.errors || {});

test('reeferPlugs: omitted and null are accepted', () => {
  assert.ok(!errorPaths(new Vessel(base)).includes('reeferPlugs'));
  assert.ok(!errorPaths(new Vessel({ ...base, reeferPlugs: null })).includes('reeferPlugs'));
  assert.ok(!errorPaths(new Vessel({ ...base, reeferPlugs: 0 })).includes('reeferPlugs'));
  assert.ok(!errorPaths(new Vessel({ ...base, reeferPlugs: 120 })).includes('reeferPlugs'));
});

test('reeferPlugs: non-integer and negative values are still rejected', () => {
  assert.ok(errorPaths(new Vessel({ ...base, reeferPlugs: 1.5 })).includes('reeferPlugs'));
  assert.ok(errorPaths(new Vessel({ ...base, reeferPlugs: -1 })).includes('reeferPlugs'));
});
