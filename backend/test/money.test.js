'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/utils/money');

test('toMinor parses decimals without float noise', () => {
  assert.equal(m.toMinor(0.1 + 0.2, 'USD'), 30);   // 0.30000000000000004
  assert.equal(m.toMinor('1234.56', 'USD'), 123456);
  assert.equal(m.toMinor(1.005, 'USD'), 101);      // half-up on the decimal text
  assert.equal(m.toMinor('10', 'JPY'), 10);
  assert.equal(m.toMinor('1.234', 'KWD'), 1234);
  assert.equal(m.toMinor('-2.50', 'USD'), -250);
  assert.throws(() => m.toMinor('abc'), TypeError);
});

test('fromMinor / format round trip', () => {
  assert.equal(m.fromMinor(123456, 'USD'), '1234.56');
  assert.equal(m.fromMinor(5, 'USD'), '0.05');
  assert.equal(m.fromMinor(-5, 'USD'), '-0.05');
  assert.equal(m.fromMinor(1234, 'KWD'), '1.234');
  assert.equal(m.fromMinor(10, 'JPY'), '10');
  assert.equal(m.format(123456789, 'USD'), '1,234,567.89 USD');
});

test('integer-only arithmetic', () => {
  assert.equal(m.add(1, 2, 3), 6);
  assert.equal(m.sub(10, 4), 6);
  assert.throws(() => m.add(1.5, 2), TypeError);
});

test('allocate never loses a cent', () => {
  assert.deepEqual(m.allocate(100, [5000, 5000]), [50, 50]);
  const a = m.allocate(100, [3333, 3333, 3334]);
  assert.equal(a.reduce((x, y) => x + y, 0), 100);
  const b = m.allocate(1, [5000, 5000]);
  assert.deepEqual(b, [1, 0]);
  const c = m.allocate(-100, [3333, 3333, 3334]);
  assert.equal(c.reduce((x, y) => x + y, 0), -100);
  for (let t = 0; t < 500; t++) {
    const total = Math.floor(Math.random() * 1e9);
    const w = [Math.ceil(Math.random() * 9000), Math.ceil(Math.random() * 9000), Math.ceil(Math.random() * 9000)];
    assert.equal(m.allocate(total, w).reduce((x, y) => x + y, 0), total);
  }
});
