'use strict';

// Pure vessel helpers (unit-tested): required-field rules, redelivery alert, hire-rate conversion.
const { toMinor, fromMinor } = require('../../utils/money');

const CHARTER_TYPES = ['Time Charter', 'Voyage Charter'];
const ALERT_DAYS = 30;
const DAY_MS = 86400000;

const blank = (v) => v === null || v === undefined || v === '';

/** Fields the master data requires on every vessel (11.2). Returns the missing ones. */
const missingRequired = (v) => {
  const missing = [];
  if (blank(v.vesselName)) missing.push('vesselName');
  if (blank(v.imoNumber)) missing.push('imoNumber');
  if (blank(v.callSign)) missing.push('callSign');
  if (blank(v.capacity)) missing.push('capacity');
  if (blank(v.ownershipType)) missing.push('ownershipType');
  if (blank(v.defaultDailyHireRateMinor)) missing.push('defaultDailyHireRate');
  if (CHARTER_TYPES.includes(v.ownershipType)) {
    if (blank(v.charterStartDate)) missing.push('charterStartDate');
    if (blank(v.charterEndDate)) missing.push('charterEndDate');
  }
  return missing;
};

/**
 * Red management alert: a chartered vessel whose redelivery date is within 30 days (or already past).
 * Computed on read - no job. `daysLeft` is negative once overdue.
 */
const redeliveryAlert = (v, now = new Date()) => {
  if (!CHARTER_TYPES.includes(v.ownershipType) || !v.charterEndDate) return null;
  const daysLeft = Math.ceil((new Date(v.charterEndDate).getTime() - now.getTime()) / DAY_MS);
  if (daysLeft > ALERT_DAYS) return null;
  return { level: 'red', daysLeft, message: daysLeft < 0 ? `Redelivery date passed ${-daysLeft} day(s) ago` : `Redelivery in ${daysLeft} day(s)` };
};

/** Decimal USD (string|number) -> integer minor units; null/'' -> null. Throws TypeError on garbage. */
const hireRateToMinor = (amount) => (blank(amount) ? null : toMinor(amount, 'USD'));
const hireRateFromMinor = (minor) => (blank(minor) ? null : fromMinor(minor, 'USD'));

/** Charter dates, when both present, must be ordered. Returns an error message or null. */
const charterDateError = (start, end) => {
  if (start && end && new Date(start) >= new Date(end)) return 'Redelivery date must be after delivery date';
  return null;
};

/**
 * Charter-party history (owner 2026-10-27). API entries carry decimal USD prices; storage is integer minor units.
 * [{charterPartyDate, deliveryDate, deliveryPrice, redeliveryDate}] -> storable entries.
 * Throws TypeError('...') with a user message on bad data.
 */
const prepareCharterHistory = (entries) => {
  if (!Array.isArray(entries)) return [];
  return entries.map((e, i) => {
    const n = i + 1;
    if (blank(e.deliveryDate) || blank(e.redeliveryDate)) throw new TypeError(`Charter entry ${n}: delivery and redelivery dates are required`);
    const err = charterDateError(e.deliveryDate, e.redeliveryDate);
    if (err) throw new TypeError(`Charter entry ${n}: ${err}`);
    let deliveryPriceMinor = null;
    try { deliveryPriceMinor = hireRateToMinor(e.deliveryPrice); } catch (_) {
      throw new TypeError(`Charter entry ${n}: price must be a valid amount`);
    }
    if ((deliveryPriceMinor ?? 0) < 0) throw new TypeError(`Charter entry ${n}: price cannot be negative`);
    return {
      ...(e._id ? { _id: e._id } : {}),
      charterPartyDate: blank(e.charterPartyDate) ? null : e.charterPartyDate,
      deliveryDate: e.deliveryDate, deliveryPriceMinor,
      redeliveryDate: e.redeliveryDate,
    };
  });
};

/** The newest entry (last appended) drives the vessel's current delivery/redelivery dates. */
const latestCharter = (history) => (Array.isArray(history) && history.length ? history[history.length - 1] : null);

/** Stored history entry -> API entry (decimal prices). */
const presentCharterEntry = (e) => ({
  ...e,
  deliveryPrice: hireRateFromMinor(e.deliveryPriceMinor),
});

/** Decorates a vessel (lean doc) for API responses. */
const present = (v, now = new Date()) => {
  if (!v) return v;
  return {
    ...v,
    defaultDailyHireRate: hireRateFromMinor(v.defaultDailyHireRateMinor),
    charterHistory: (v.charterHistory || []).map(presentCharterEntry),
    redeliveryAlert: redeliveryAlert(v, now),
    incompleteFields: missingRequired(v),
  };
};

module.exports = { CHARTER_TYPES, ALERT_DAYS, missingRequired, redeliveryAlert, hireRateToMinor, hireRateFromMinor, charterDateError, prepareCharterHistory, latestCharter, presentCharterEntry, present };
