'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/modules/bookings/importRules.logic');

const bk = (status, extra = {}) => ({ status, bookingNumber: 'BK-1', containerNumber: 'C1', ...extra });

test('no existing booking: valid for booking, new for finalLoading', () => {
  assert.equal(R.classifyExisting({ importType: 'booking', existing: null }).rowStatus, 'valid');
  assert.equal(R.classifyExisting({ importType: 'finalLoading', existing: null }).rowStatus, 'new');
});

test('FL-03: Pending/Confirmed bookings can be updated', () => {
  assert.equal(R.classifyExisting({ importType: 'booking', existing: bk('Pending') }).rowStatus, 'update');
  assert.equal(R.classifyExisting({ importType: 'finalLoading', existing: bk('Confirmed') }).rowStatus, 'update');
});

test('FL-03: Final Loading and invoiced bookings are never overwritten', () => {
  const fl = R.classifyExisting({ importType: 'booking', existing: bk('Final Loading') });
  assert.equal(fl.rowStatus, 'invalid');
  assert.match(fl.error, /already Final Loading/);
  const inv = R.classifyExisting({ importType: 'booking', existing: bk('Pending'), invoiced: true });
  assert.equal(inv.rowStatus, 'invalid');
  assert.match(inv.error, /invoice/);
  // in a Final Loading file they stay in the manifest, untouched
  assert.equal(R.classifyExisting({ importType: 'finalLoading', existing: bk('Final Loading') }).rowStatus, 'unchanged');
  assert.equal(R.classifyExisting({ importType: 'finalLoading', existing: bk('Final Loading'), invoiced: true }).rowStatus, 'unchanged');
});

test('a Cancelled booking is history: a live one wins, only-cancelled means a new booking', () => {
  assert.equal(R.pickExisting([bk('Cancelled')]), null);
  const live = bk('Pending', { createdAt: '2026-02-01' });
  assert.equal(R.pickExisting([bk('Cancelled', { createdAt: '2026-03-01' }), live]), live);
  assert.equal(R.classifyExisting({ importType: 'finalLoading', existing: R.pickExisting([bk('Cancelled')]) }).rowStatus, 'new');
});

test('partner scope: another partner\'s container reads as already booked', () => {
  const r = R.classifyExisting({ importType: 'booking', existing: bk('Pending', { partnerId: 'P2' }), partnerScope: 'P1' });
  assert.equal(r.rowStatus, 'invalid');
  assert.equal(R.classifyExisting({ importType: 'booking', existing: bk('Pending', { partnerId: 'P1' }), partnerScope: 'P1' }).rowStatus, 'update');
  assert.equal(R.classifyExisting({ importType: 'booking', existing: bk('Pending'), partnerScope: 'P1' }).rowStatus, 'invalid'); // unlabelled
});

test('duplicates inside the file: the first occurrence wins', () => {
  const out = R.markDuplicates([
    { containerNumber: 'A', _rowStatus: 'valid', _errors: [] },
    { containerNumber: 'A', _rowStatus: 'valid', _errors: [] },
    { containerNumber: 'B', _rowStatus: 'valid', _errors: [] },
  ]);
  assert.deepEqual(out.map((r) => r._rowStatus), ['valid', 'invalid', 'valid']);
});

test('FL-04: a manifest with an unsaveable row is refused as a whole', () => {
  assert.doesNotThrow(() => R.assertManifestComplete([{ _rowStatus: 'new' }, { _rowStatus: 'update' }, { _rowStatus: 'unchanged' }]));
  for (const st of ['invalid', 'unresolved', 'ambiguous']) {
    assert.throws(() => R.assertManifestComplete([{ _rowStatus: 'new' }, { _rowStatus: st }]), (e) => e.status === 400 && e.code === 'IMPORT_ROWS_INVALID');
  }
});

test('sweep only targets live bookings missing from the manifest', () => {
  const all = [bk('Pending', { containerNumber: 'A' }), bk('Final Loading', { containerNumber: 'B' }), bk('Cancelled', { containerNumber: 'C' }), bk('Confirmed', { containerNumber: 'D' })];
  assert.deepEqual(R.sweepTargets(all, ['A']).map((b) => b.containerNumber), ['B', 'D']);
  assert.deepEqual(R.sweepTargets(all, ['A', 'B', 'D']), []);
});
