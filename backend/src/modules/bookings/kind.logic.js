'use strict';

// Layer 1 `kind` (Voyage Details sprint C): a ManualBooking is an "Estimate" (the default) or an "Allocation" (a slot
// reserved for an agent on a voyage). Old documents have no `kind`: they are read as Estimate with NO migration, so every
// query asks "kind != Allocation" for estimates and never "kind == Estimate". Pure, no DB.

const KINDS = Object.freeze(['Estimate', 'Allocation']);

/** Kind of a stored document (a missing or unknown value reads as Estimate). */
const kindOf = (doc) => (doc && doc.kind === 'Allocation' ? 'Allocation' : 'Estimate');

/** Add the read-time default to a lean document (returns the same object). */
const withKind = (doc) => { if (doc) doc.kind = kindOf(doc); return doc; };

/** Mongo fragment for a list filter: '' = no filter. A bad value is a 400, never a silent "no filter". */
const kindFilter = (kind) => {
  if (kind === undefined || kind === null || kind === '') return null;
  if (!KINDS.includes(kind)) throw { status: 400, message: `kind must be one of: ${KINDS.join(', ')}` };
  return kind === 'Allocation' ? { kind: 'Allocation' } : { kind: { $ne: 'Allocation' } };
};

/** Kind to store on create: partner users can only create estimates; anything else must be a known kind. */
const kindForCreate = (kind, { isPartnerUser = false } = {}) => {
  if (isPartnerUser) return 'Estimate';
  if (kind === undefined || kind === null || kind === '') return 'Estimate';
  if (!KINDS.includes(kind)) throw { status: 400, message: `kind must be one of: ${KINDS.join(', ')}` };
  return kind;
};

module.exports = { KINDS, kindOf, withKind, kindFilter, kindForCreate };
