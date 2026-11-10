'use strict';

// Partner users (role.isPartnerRole) are external: they only see and create bookings labelled with their own
// partner. Every bookings controller computes the scope once and hands it to the service.

const mongoose = require('mongoose');

/** The partner id the caller is confined to, or null for staff. Throws 403 for a partner user without a partner. */
const scopeOf = (user) => {
  if (!user?.roleId?.isPartnerRole) return null;
  if (!user.partnerId) throw { status: 403, message: 'This partner user has no partner assigned' };
  return String(user.partnerId._id || user.partnerId);
};

/** Optional staff-chosen partner label: must be an existing Active Partner. null/'' clears it. */
const assertPartner = async (partnerId) => {
  if (partnerId === undefined || partnerId === null || partnerId === '') return null;
  if (!mongoose.isValidObjectId(partnerId)) throw { status: 400, message: 'Valid partner is required' };
  const p = await mongoose.model('Partner').findById(partnerId).select('status').lean();
  if (!p) throw { status: 400, message: 'Partner not found' };
  if (p.status !== 'Active') throw { status: 400, message: 'Partner is not Active' };
  return partnerId;
};

/** A partner user may only touch their own booking; anything else reads as not found. */
const assertOwn = (doc, scope) => {
  if (scope && String(doc.partnerId || '') !== scope) throw { status: 404, message: 'Booking not found' };
};

module.exports = { scopeOf, assertPartner, assertOwn };
