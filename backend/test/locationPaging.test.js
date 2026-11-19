'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_LIMIT, MAX_LIMIT, STABLE_SORT, parsePaging, searchFilter, idParam } = require('../src/modules/locations/paging.logic');

test('paging defaults: page 1, limit 20', () => {
  assert.deepEqual(parsePaging(), { page: 1, limit: 20, skip: 0 });
  assert.deepEqual(parsePaging({}), { page: 1, limit: DEFAULT_LIMIT, skip: 0 });
});

test('paging: skip follows page and limit', () => {
  assert.deepEqual(parsePaging({ page: '3', limit: '50' }), { page: 3, limit: 50, skip: 100 });
  assert.equal(parsePaging({ page: 2, limit: 20 }).skip, 20);
});

test('limit is capped at 100 and never below 1', () => {
  assert.equal(MAX_LIMIT, 100);
  assert.equal(parsePaging({ limit: '100' }).limit, 100);
  assert.equal(parsePaging({ limit: '101' }).limit, 100);
  assert.equal(parsePaging({ limit: '99999' }).limit, 100);
  assert.equal(parsePaging({ limit: '0' }).limit, DEFAULT_LIMIT);
  assert.equal(parsePaging({ limit: '-5' }).limit, DEFAULT_LIMIT);
});

test('bad page / limit values fall back to the defaults', () => {
  for (const bad of ['abc', '', null, undefined, '0', '-1', 'NaN']) assert.equal(parsePaging({ page: bad }).page, 1, String(bad));
  assert.equal(parsePaging({ limit: 'abc' }).limit, DEFAULT_LIMIT);
});

test('search: case-insensitive contains on the given fields, user input is regex-escaped', () => {
  const f = searchFilter('Port', ['name', 'code']);
  assert.deepEqual(f, { $or: [{ name: { $regex: 'Port', $options: 'i' } }, { code: { $regex: 'Port', $options: 'i' } }] });
  const esc = searchFilter('a.b(c)', ['name']);
  assert.equal(esc.$or[0].name.$regex, 'a\\.b\\(c\\)');
  assert.equal(new RegExp(esc.$or[0].name.$regex, 'i').test('xa.b(c)y'), true);
  assert.equal(new RegExp(esc.$or[0].name.$regex, 'i').test('aXb(c)'), false);
});

test('search: blank means no filter', () => {
  for (const v of [undefined, null, '', '   ']) assert.equal(searchFilter(v, ['name']), null);
});

test('parent filter: empty is ignored, a valid ObjectId passes, junk is a 400 (not a CastError)', () => {
  assert.equal(idParam('', 'city'), null);
  assert.equal(idParam(undefined, 'city'), null);
  assert.equal(idParam('6af350817bae2d4ecd54da04', 'city'), '6af350817bae2d4ecd54da04');
  assert.throws(() => idParam('nope', 'city'), (e) => e.status === 400 && /Invalid city/.test(e.message));
  assert.throws(() => idParam({ $ne: null }, 'country'), (e) => e.status === 400);
});

test('stable sort is name then _id', () => {
  assert.deepEqual(Object.keys(STABLE_SORT), ['name', '_id']);
  assert.deepEqual(Object.values(STABLE_SORT), [1, 1]);
});
