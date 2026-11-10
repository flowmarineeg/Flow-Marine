'use strict';

const mongoose = require('mongoose');
const lock = require('../rounds/roundLock');
const { validateVoyageState, scheduleWarnings } = require('./voyage.logic');
const { nextNumber } = require('../../utils/autoNumber');
const { formatVoyageNumber, buildPortCalls, overlapWarnings, mergePortCallDates } = require('./voyageRun.logic');
const Voyage   = require('./voyage.model');
const Round    = require('../rounds/round.model');
const Service  = require('../services/service.model');
const Port     = require('../locations/port.model');
const { VOYAGE_STATUS, DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const { invalidateRoundCache } = require('../capacity/capacity.service');

// ─── Valid status transitions ─────────────────────────────────────────────────
const STATUS_TRANSITIONS = {
  Scheduled:    ['Departed', 'Cancelled'],
  Departed:     ['In Transit', 'Arrived', 'Cancelled'],
  'In Transit': ['Arrived', 'Cancelled'],
  Arrived:      ['Completed'],
  Completed:    [],
  Cancelled:    [],
};

const validateTransition = (current, next) => {
  const allowed = STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw {
      status: 400,
      message: `Cannot transition from "${current}" to "${next}". Allowed: ${allowed.join(', ') || 'none'}`,
    };
  }
};

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  roundId = '', serviceId = '', status = '',
  polId = '', podId = '',
} = {}) => {
  const query = {};
  if (roundId)   query.roundId   = roundId;
  if (serviceId) query.serviceId = serviceId;
  if (status) {
    const statusList = status.split(',').map(s => s.trim()).filter(Boolean);
    query.status = statusList.length === 1 ? statusList[0] : { $in: statusList };
  }
  if (polId) query.polId = polId;
  if (podId) query.podId = podId;

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    Voyage.find(query)
      .populate('roundId',   'roundNumber roundName')
      .populate('serviceId', 'serviceCode serviceName')
      .populate('polId',     'name code')
      .populate('podId',     'name code')
      // Sprint 042 — sorted by roundId first so a round's voyages always
      // arrive contiguous, needed for VoyageList.jsx's grouped-by-round
      // display. No effect on any caller that already scopes by roundId
      // (ManualBookingForm/BookingForm dropdowns etc.) since roundId is
      // constant within those queries.
      .sort({ roundId: 1, sequence: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Voyage.countDocuments(query),
  ]);

  return { data, total };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id) => {
  const voyage = await Voyage.findById(id)
    .populate('roundId',   'roundNumber roundName startDate endDate')
    .populate('serviceId', 'serviceCode serviceName')
    .populate('polId',     'name code')
    .populate('podId',     'name code')
    .lean();
  if (!voyage) throw { status: 404, message: 'Voyage not found' };
  return voyage;
};

// ─── Legs of a round ──────────────────────────────────────────────────────────
// The round's own (editable) legs are the source of truth: routeSnapshot.legs, each with a stable legKey.
const roundRouteLegs = (round) => {
  const legs = round.routeSnapshot?.legs;
  if (!legs?.length) return null;
  return [...legs]
    .sort((a, b) => a.sequence - b.sequence)
    .map(l => ({ sequence: l.sequence, legKey: l.legKey, portId: l.portId, name: l.portName, code: l.portCode, portName: l.portName, portCode: l.portCode }));
};

// ─── Legs (with ports) available for a round's voyages ────────────────────────
const getRoundRoutePorts = async (roundId) => {
  const round = await Round.findOne({ _id: roundId }).lean();
  if (!round) throw { status: 404, message: 'Round not found' };

  const legs = roundRouteLegs(round);
  if (!legs) throw { status: 404, message: 'This round has no legs' };
  return legs;
};

// Next voyage sequence for a round. lastVoyageSeq only ever grows, so deleting the last voyage can never
// make its number come back (RV-35). Older rounds without the field are initialised from max(sequence).
const allocateSequence = async (roundId, session) => {
  const inc = () => Round.findOneAndUpdate(
    { _id: roundId, lastVoyageSeq: { $type: 'number' } },
    { $inc: { lastVoyageSeq: 1 } },
    { new: true, session, projection: 'lastVoyageSeq' }
  );
  let r = await inc();
  if (!r) {
    const last = await Voyage.findOne({ roundId }).sort({ sequence: -1 }).select('sequence').session(session).lean();
    await Round.updateOne({ _id: roundId, lastVoyageSeq: { $exists: false } }, { $set: { lastVoyageSeq: last?.sequence || 0 } }, { session });
    r = await inc();
  }
  return r.lastVoyageSeq;
};

const previousVoyage = (roundId, sequence) =>
  Voyage.findOne({ roundId, sequence: { $lt: sequence } }).sort({ sequence: -1 }).select('eta').lean();

// ─── Create a voyage (one run over a range of the round's legs) ──────────────
// data: { direction, fromLegKey, toLegKey, etd, eta, etp, atd, ata, voyageCode, voyageName, portCalls:[{legKey,eta,etd}] }
// A voyage always starts Scheduled (RV-39). polId/podId are derived from the first/last port call.
const createVoyage = async (roundId, data, createdBy) => {
  await lock.assertRoundOpen(roundId);
  const round = await Round.findOne({ _id: roundId }).lean();
  if (!round) throw { status: 404, message: 'Round not found' };
  if (['Completed', 'Cancelled'].includes(round.status)) {
    throw { status: 400, message: `Cannot add voyages to a ${round.status} round` };
  }
  const service = await Service.findById(round.serviceId).lean();
  if (!service) throw { status: 400, message: 'Service not found' };

  const legs = roundRouteLegs(round);
  if (!legs) throw { status: 400, message: 'This round has no legs' };

  const { direction, fromLegKey, toLegKey } = data;
  formatVoyageNumber('V', direction);   // validates the direction
  const portCalls = mergePortCallDates(buildPortCalls(legs, fromLegKey, toLegKey), data.portCalls);
  const first = portCalls[0], last = portCalls[portCalls.length - 1];

  const state = {
    etd: data.etd || first.etd || null, eta: data.eta || last.eta || null,
    atd: data.atd || null, ata: data.ata || null,
    status: 'Scheduled',
  };
  validateVoyageState(state, { statusChanged: true });

  // The counter is global and atomic, outside the transaction (a failed create burns a number, never duplicates).
  const voyageNumber = formatVoyageNumber(await nextNumber('voyage'), direction);

  const { voyageId, sequence } = await mongoose.connection.transaction(async (session) => {
    const seq = await allocateSequence(roundId, session);
    const [voyage] = await Voyage.create([{
      voyageNumber,
      voyageCode:     data.voyageCode  || null,
      voyageName:     data.voyageName  || null,
      roundId,
      serviceId:      round.serviceId,
      polId:          first.portId,
      podId:          last.portId,
      direction, fromLegKey, toLegKey, portCalls,
      sequence:       seq,
      etd:            state.etd,
      eta:            state.eta,
      etp:            data.etp  || null,
      atd:            state.atd,
      ata:            state.ata,
      status:         'Scheduled',
      isManual:       true,
      createdBy,
      updatedBy:      createdBy,
    }], { session });
    await Round.updateOne({ _id: roundId }, { $push: { voyageIds: voyage._id } }, { session });
    return { voyageId: voyage._id, sequence: seq };
  });

  invalidateRoundCache(roundId);

  const out = await Voyage.findById(voyageId)
    .populate('polId', 'name code')
    .populate('podId', 'name code')
    .lean();
  const others = await Voyage.find({ roundId, _id: { $ne: voyageId } }).select('voyageNumber direction fromLegKey toLegKey status').lean();
  out.warnings = [
    ...scheduleWarnings(state, round, await previousVoyage(roundId, sequence)),
    ...overlapWarnings(legs, { direction, fromLegKey, toLegKey }, others),
  ];
  return out;
};

// Rebuild a voyage's port calls from the round's CURRENT legs (after the legs were edited). Per-port dates are
// carried over by legKey. Refused while live bookings sit on the voyage, because their POL/POD were derived
// from it.
const refreshPortCalls = async (id, updatedBy) => {
  await lock.assertVoyageRoundOpen(id);
  const voyage = await Voyage.findById(id);
  if (!voyage) throw { status: 404, message: 'Voyage not found' };
  if (!voyage.fromLegKey || !voyage.toLegKey) throw { status: 400, message: 'This voyage is not a leg run' };
  const round = await Round.findById(voyage.roundId).lean();
  const legs = roundRouteLegs(round);
  if (!legs) throw { status: 400, message: 'This round has no legs' };

  const Booking = require('../bookings/booking.model');
  const ManualBooking = require('../bookings/manualBooking.model');
  const q = { voyageId: id, status: { $ne: 'Cancelled' } };
  const [l2, l1] = await Promise.all([Booking.exists(q), ManualBooking.exists(q)]);
  if (l2 || l1) {
    throw { status: 409, message: "Cannot refresh port calls — live bookings use this voyage's ports. Cancel or move them first." };
  }

  const fresh = buildPortCalls(legs, voyage.fromLegKey, voyage.toLegKey);
  const old = new Map(voyage.portCalls.map(c => [c.legKey, c]));
  voyage.portCalls = fresh.map(c => ({ ...c, eta: old.get(c.legKey)?.eta || null, etd: old.get(c.legKey)?.etd || null }));
  voyage.polId = fresh[0].portId;
  voyage.podId = fresh[fresh.length - 1].portId;
  voyage.updatedBy = updatedBy;
  await voyage.save();
  invalidateRoundCache(voyage.roundId);
  return Voyage.findById(id).populate('polId', 'name code').populate('podId', 'name code').lean();
};

// ─── Cancelling a voyage cancels its bookings (owner, 2026-11-10) ─────────────
// Every non-Cancelled Layer 2 booking and Layer 1 estimate of the voyage becomes Cancelled in the SAME transaction as
// the voyage. A booking on a live invoice line (not already orphaned) blocks it (409 BOOKING_INVOICED): raise a credit
// note or cancel the invoice first, exactly like the Final Loading import. Runs inside connection.transaction (the
// async-local-storage session of config/db.js makes these writes join it).
const cancelVoyageBookings = async (voyageId, userId) => {
  const Booking = require('../bookings/booking.model');
  const ManualBooking = require('../bookings/manualBooking.model');
  const Invoice = require('../invoices/invoice.model');
  const live = await Booking.find({ voyageId, status: { $ne: 'Cancelled' } }).select('_id containerNumber').lean();
  if (live.length) {
    const billed = await Invoice.find({
      status: { $ne: 'Cancelled' },
      lineItems: { $elemMatch: { bookingId: { $in: live.map(b => b._id) }, orphaned: { $ne: true } } },
    }).select('invoiceNumber lineItems.bookingId').lean();
    if (billed.length) {
      const containers = live.filter(b => billed.some(i => i.lineItems.some(li => String(li.bookingId) === String(b._id)))).map(b => b.containerNumber);
      throw {
        status: 409,
        message: `Cannot cancel this voyage: ${containers.length} of its booking(s) are on live invoices (${billed.map(i => i.invoiceNumber).join(', ')}). Raise a credit note or cancel the invoice first. Containers: ${containers.slice(0, 10).join(', ')}${containers.length > 10 ? '…' : ''}`,
      };
    }
    await Booking.updateMany({ _id: { $in: live.map(b => b._id) } }, { $set: { status: 'Cancelled', updatedBy: userId } });
  }
  const est = await ManualBooking.updateMany({ voyageId, status: { $ne: 'Cancelled' } }, { $set: { status: 'Cancelled', updatedBy: userId } });
  return { bookings: live.length, estimates: est.modifiedCount || 0 };
};

// ─── Update ───────────────────────────────────────────────────────────────────
// canOverride (voyages:override permission, or SuperAdmin's implicit RBAC
// bypass — see voyage.controller.js) skips STATUS_TRANSITIONS entirely, same
// shape as invoice.service.js's invoices:override (Sprint 046). Without it,
// every caller still goes through validateTransition() exactly as before.
// It never skips the date rules: Departed needs an ATD, Arrived an ATA, ETA/ATA cannot precede ETD/ATD.
const update = async (id, data, updatedBy, canOverride = false) => {
  await lock.assertVoyageRoundOpen(id);
  const voyage = await Voyage.findById(id);
  if (!voyage) throw { status: 404, message: 'Voyage not found' };

  const statusChanged = !!data.status && data.status !== voyage.status;
  if (statusChanged && !canOverride) {
    validateTransition(voyage.status, data.status);
    // RV-39: a voyage only sails while its round is Active
    if (['Departed', 'In Transit', 'Arrived', 'Completed'].includes(data.status)) {
      const r = await Round.findById(voyage.roundId).select('status roundNumber').lean();
      if (r && r.status !== 'Active') {
        throw { status: 400, message: `Round ${r.roundNumber} is ${r.status} — activate the round before moving its voyages to ${data.status}` };
      }
    }
  }

  // Validate the COMPLETE resulting state, not just the patch (RV-18..20)
  const next = {};
  ['etd', 'eta', 'atd', 'ata', 'status'].forEach(f => {
    next[f] = data[f] !== undefined ? (data[f] || null) : voyage[f];
  });
  validateVoyageState(next, { statusChanged });

  // Extended allowed fields: now includes etp and voyageCode
  const allowed = ['etd', 'eta', 'etp', 'atd', 'ata', 'status', 'voyageCode', 'voyageName'];
  allowed.forEach(field => {
    if (data[field] !== undefined) voyage[field] = data[field] || null;
  });
  if (data.portCalls !== undefined) voyage.portCalls = mergePortCallDates(voyage.portCalls, data.portCalls);
  voyage.updatedBy = updatedBy;

  // Cancelling cancels the voyage's bookings too, all or nothing
  const becameCancelled = statusChanged && data.status === 'Cancelled';
  let cancelled = null;
  if (becameCancelled) {
    cancelled = await mongoose.connection.transaction(async () => {
      const c = await cancelVoyageBookings(voyage._id, updatedBy);
      await voyage.save();
      return c;
    });
    require('../billing/bookingItem.service').scheduleSync({ voyageIds: [voyage._id] }); // invoiceable items follow
  } else {
    await voyage.save();
  }

  // Invalidate capacity cache for this round (status change affects engine output)
  invalidateRoundCache(voyage.roundId);

  const round = await Round.findById(voyage.roundId).select('startDate endDate').lean();
  const out = await Voyage.findById(id)
    .populate('roundId',   'roundNumber roundName')
    .populate('serviceId', 'serviceCode serviceName')
    .populate('polId',     'name code')
    .populate('podId',     'name code')
    .lean();
  out.warnings = scheduleWarnings(next, round, await previousVoyage(voyage.roundId, voyage.sequence));
  if (cancelled) out.cancelled = cancelled; // { bookings, estimates } cancelled with the voyage
  return out;
};

// ─── Delete Voyage (hard delete, guarded by bookings) ────────────────────────
// Any voyage may be deleted when nothing depends on it (live bookings, Layer 1 bookings, tracking, expenses,
// ledger lines, invoiced items — RV-38). Surviving voyages are never renumbered.
const deleteVoyage = async (id) => {
  await lock.assertVoyageRoundOpen(id);
  const voyage = await Voyage.findById(id).lean();
  if (!voyage) throw { status: 404, message: 'Voyage not found' };

  // Block if any active (non-Cancelled) bookings exist
  let Booking;
  try { Booking = require('../bookings/booking.model'); } catch { Booking = null; }

  if (Booking) {
    const hasBookings = await Booking.exists({
      voyageId:  id,
      status:    { $ne: 'Cancelled' },
    });
    if (hasBookings) {
      throw { status: 400, message: 'Cannot delete — voyage has active bookings. Cancel the bookings first.' };
    }
  }

  // Audit H5: never orphan ledger lines / posted expenses / invoiced items
  const { assertNoDependents, DEPENDENTS } = require('../../utils/dependents');
  await assertNoDependents('voyage', id, DEPENDENTS.voyage);

  await mongoose.connection.transaction(async (session) => {
    await mongoose.model('BookingItem').deleteMany({ voyageId: id, locked: false }, { session });
    // Remove from Round.voyageIds
    await Round.updateOne({ _id: voyage.roundId }, { $pull: { voyageIds: voyage._id } }, { session });
    // Hard delete
    await Voyage.deleteOne({ _id: id }, { session });
  });

  invalidateRoundCache(voyage.roundId);   // RV-23
};

// ─── Get allowed next statuses ────────────────────────────────────────────────
const getAllowedTransitions = (currentStatus) => STATUS_TRANSITIONS[currentStatus] || [];

module.exports = {
  list, getById, getRoundRoutePorts,
  createVoyage, refreshPortCalls, update, deleteVoyage,
  getAllowedTransitions,
};
