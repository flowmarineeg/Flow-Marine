'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TABS, summariseEstimated, summariseOperational, sortRows } = require('../src/modules/bookings/bookingSummary.logic');

test('the four Bookings tabs', () => {
  assert.deepEqual([...TABS], ['estimated', 'operational', 'discharged', 'remaining']);
});

test('estimated: Layer 1 totals pass through, freight rounded to cents', () => {
  const m = summariseEstimated([{ _id: 'v1', bookings: 3, totalFreight: 100.005 + 200.1, totalTEU: 12 }, { _id: 'v2', bookings: 1, totalFreight: 50, totalTEU: 2 }]);
  assert.deepEqual(m.get('v1'), { bookings: 3, totalFreight: 300.11, totalTEU: 12 });
  assert.deepEqual(m.get('v2'), { bookings: 1, totalFreight: 50, totalTEU: 2 });
});

test('operational: one booking = one container, TEU from the SIZE (20ft 1, 40ft/40HC/45ft 2)', () => {
  const sizes = new Map([['t20', '20ft'], ['t40', '40ft'], ['thc', '40HC'], ['t45', '45ft']]);
  const m = summariseOperational([
    { voyageId: 'v1', containerTypeId: 't20', count: 4, freight: 400 },
    { voyageId: 'v1', containerTypeId: 't40', count: 2, freight: 600 },
    { voyageId: 'v1', containerTypeId: 'thc', count: 1, freight: 350.5 },
    { voyageId: 'v1', containerTypeId: 't45', count: 1, freight: 10 },
    { voyageId: 'v2', containerTypeId: 't20', count: 5, freight: 500 },
  ], sizes);
  assert.deepEqual(m.get('v1'), { bookings: 8, totalFreight: 1360.5, totalTEU: 4 + 4 + 2 + 2 });
  assert.deepEqual(m.get('v2'), { bookings: 5, totalFreight: 500, totalTEU: 5 });
});

test('operational: an unknown container size counts as 1 TEU (resolver fail-safe) and ObjectId-like keys match by string', () => {
  const id = { toString: () => 'abc' };
  const m = summariseOperational([{ voyageId: id, containerTypeId: { toString: () => 'ty' }, count: 2, freight: 0 }], new Map([['ty', 'weird']]));
  assert.deepEqual(m.get('abc'), { bookings: 2, totalFreight: 0, totalTEU: 2 });
});

test('empty input gives empty maps', () => {
  assert.equal(summariseEstimated([]).size, 0);
  assert.equal(summariseOperational([], new Map()).size, 0);
});

test('sortRows: newest round first, then voyage number', () => {
  const rows = sortRows([
    { voyageNumber: 'V0002E', roundStart: '2026-01-01' },
    { voyageNumber: 'V0003E', roundStart: '2026-06-01' },
    { voyageNumber: 'V0001E', roundStart: '2026-01-01' },
  ]);
  assert.deepEqual(rows.map((r) => r.voyageNumber), ['V0003E', 'V0001E', 'V0002E']);
});
