'use strict';

// Pure rules of the booking Excel import (bookings sprint 2026-11-10: audit FL-03 and FL-04). No DB access.

const SAVEABLE = ['valid', 'new', 'update', 'unchanged'];
const bad = (status, message, extra = {}) => ({ status, message, ...extra });

/** The booking a container row refers to: a live booking wins; a Cancelled one is history, never revived. */
const pickExisting = (bookings) => {
  const live = (bookings || []).filter((b) => b.status !== 'Cancelled');
  if (!live.length) return null;
  return [...live].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
};

/**
 * What an import row may do to the booking it matches (FL-03: Final Loading and invoiced bookings are never overwritten).
 * existing: lean booking or null; invoiced: it sits on a live invoice line; partnerScope: partner user's partner id or null.
 * -> { rowStatus: 'valid'|'new'|'update'|'unchanged'|'invalid', error? }
 */
const classifyExisting = ({ importType, existing, invoiced = false, partnerScope = null }) => {
  if (!existing) return { rowStatus: importType === 'finalLoading' ? 'new' : 'valid' };
  if (partnerScope && String(existing.partnerId || '') !== String(partnerScope)) {
    return { rowStatus: 'invalid', error: 'This container is already booked' };
  }
  if (existing.status === 'Final Loading' || invoiced) {
    const why = invoiced ? 'is on an invoice' : 'is already Final Loading';
    if (importType === 'finalLoading') return { rowStatus: 'unchanged' }; // stays in the manifest, nothing is overwritten
    return { rowStatus: 'invalid', error: `Booking ${existing.bookingNumber || ''} ${why} and cannot be changed by an import`.replace('  ', ' ') };
  }
  return { rowStatus: 'update' };
};

/** Second and later occurrences of a container inside one file are invalid (the first one wins). */
const markDuplicates = (rows) => {
  const seen = new Set();
  return rows.map((r) => {
    const c = r.containerNumber;
    if (!c) return r;
    if (seen.has(c)) return { ...r, _rowStatus: 'invalid', _errors: [...(r._errors || []), 'Container appears more than once in the file'] };
    seen.add(c);
    return r;
  });
};

/**
 * FL-04: a Final Loading file is a manifest. It cancels every booking missing from it, so one row that cannot be
 * saved could cancel a real booking. Refuse the whole file instead of saving part of it.
 */
const assertManifestComplete = (rows) => {
  const blocked = rows.filter((r) => !SAVEABLE.includes(r._rowStatus));
  if (blocked.length) {
    throw bad(400, `Final Loading cancels every booking missing from the file, so every row must be valid: ${blocked.length} row(s) are invalid, unresolved or ambiguous - fix them first`, {
      code: 'IMPORT_ROWS_INVALID',
    });
  }
};

/** Bookings the sweep cancels: live bookings of the agent in the round whose container is not in the manifest. */
const sweepTargets = (roundBookings, manifestContainers) => {
  const m = new Set(manifestContainers);
  return (roundBookings || []).filter((b) => b.status !== 'Cancelled' && !m.has(b.containerNumber));
};

module.exports = { SAVEABLE, pickExisting, classifyExisting, markDuplicates, assertManifestComplete, sweepTargets };
