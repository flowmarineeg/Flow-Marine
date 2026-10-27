'use strict';

const mongoose = require('mongoose');
const lock = require('../rounds/roundLock');
const { validateVoyageState, scheduleWarnings, deleteBlockReason } = require('./voyage.logic');
const Voyage   = require('./voyage.model');
const Round    = require('../rounds/round.model');
const Route    = require('../routes/route.model');
const RouteLeg = require('../routes/routeLeg.model');
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

// ─── Route legs of a round ────────────────────────────────────────────────────
// The round's own routeSnapshot is the source of truth (RV-13/14). Rounds created before the snapshot
// existed fall back to the live Service route.
const roundRouteLegs = async (round) => {
  if (round.routeSnapshot?.legs?.length) {
    return [...round.routeSnapshot.legs]
      .sort((a, b) => a.sequence - b.sequence)
      .map(l => ({ sequence: l.sequence, portId: l.portId, name: l.portName, code: l.portCode }));
  }
  const route = await Route.findOne({ serviceId: round.serviceId }).lean();
  if (!route) return null;
  const legs = await RouteLeg.find({ routeId: route._id })
    .populate('portId', 'name code')
    .sort({ sequence: 1 })
    .lean();
  return legs.map(l => ({
    sequence: l.sequence,
    portId:   l.portId?._id || l.portId,
    name:     l.portId?.name,
    code:     l.portId?.code,
  }));
};

// ─── Get ports available for a round (from the round's route) ─────────────────
const getRoundRoutePorts = async (roundId) => {
  const round = await Round.findOne({ _id: roundId }).lean();
  if (!round) throw { status: 404, message: 'Round not found' };

  const legs = await roundRouteLegs(round);
  if (!legs) throw { status: 404, message: 'No route found for this service' };
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

// ─── Create Manual Voyage ─────────────────────────────────────────────────────
const createManualVoyage = async (roundId, data, createdBy) => {
  await lock.assertRoundOpen(roundId);
  // 1. Load and validate round
  const round = await Round.findOne({ _id: roundId }).lean();
  if (!round) throw { status: 404, message: 'Round not found' };
  if (['Completed', 'Cancelled'].includes(round.status)) {
    throw { status: 400, message: `Cannot add voyages to a ${round.status} round` };
  }

  // 2. Load service for serviceCode
  const service = await Service.findById(round.serviceId).lean();
  if (!service) throw { status: 400, message: 'Service not found' };

  // 3. Validate POL and POD exist
  const { polId, podId } = data;
  if (!polId || !podId) throw { status: 400, message: 'POL and POD are required' };
  if (String(polId) === String(podId)) throw { status: 400, message: 'POL and POD cannot be the same port' };

  // 4. Validate both ports are in the round's route (snapshot, or the live route for older rounds)
  const legs = await roundRouteLegs(round);
  if (!legs) throw { status: 400, message: 'Service has no route defined' };
  const inRoute = (portId) => legs.some(l => String(l.portId) === String(portId));
  if (!inRoute(polId)) throw { status: 400, message: 'POL is not in the round route legs' };
  if (!inRoute(podId)) throw { status: 400, message: 'POD is not in the round route legs' };

  // 5. Dates / status must be coherent (RV-18..20)
  const state = {
    etd: data.etd || null, eta: data.eta || null, atd: data.atd || null, ata: data.ata || null,
    status: data.status || 'Scheduled',
  };
  validateVoyageState(state, { statusChanged: true });

  // 6. Sequence + number + insert + push to the round, atomically
  const { voyageId, sequence } = await mongoose.connection.transaction(async (session) => {
    const seq = await allocateSequence(roundId, session);
    // Format preserved: {serviceCode}-{roundNumber}-{seq:02d}. The counter is monotonic, so a number is
    // never re-issued; the unique index stays as the last line of defence.
    const voyageNumber = `${service.serviceCode}-${round.roundNumber}-${String(seq).padStart(2, '0')}`;
    const [voyage] = await Voyage.create([{
      voyageNumber,
      voyageCode:     data.voyageCode  || null,
      voyageName:     data.voyageName  || null,
      roundId,
      serviceId:      round.serviceId,
      polId,
      podId,
      sequence:       seq,
      etd:            data.etd  || null,
      eta:            data.eta  || null,
      etp:            data.etp  || null,
      atd:            data.atd  || null,
      ata:            data.ata  || null,
      status:         state.status,
      isManual:       true,
      createdBy,
      updatedBy:      createdBy,
    }], { session });
    await Round.updateOne({ _id: roundId }, { $push: { voyageIds: voyage._id } }, { session });
    return { voyageId: voyage._id, sequence: seq };
  });

  // The capacity engine reads this round's voyages: drop its cache only after the write committed (RV-21)
  invalidateRoundCache(roundId);

  const out = await Voyage.findById(voyageId)
    .populate('polId', 'name code')
    .populate('podId', 'name code')
    .lean();
  out.warnings = scheduleWarnings(state, round, await previousVoyage(roundId, sequence));
  return out;
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
  voyage.updatedBy = updatedBy;
  await voyage.save();

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
  return out;
};

// ─── Delete Voyage (hard delete, guarded by bookings) ────────────────────────
// A manual voyage, or the LAST generated voyage, may be deleted. A middle generated voyage would break
// the POL/POD chain: cancel it instead (RV-22). Surviving voyages are never renumbered.
const deleteVoyage = async (id) => {
  await lock.assertVoyageRoundOpen(id);
  const voyage = await Voyage.findById(id).lean();
  if (!voyage) throw { status: 404, message: 'Voyage not found' };

  const siblings = await Voyage.find({ roundId: voyage.roundId, _id: { $ne: voyage._id } }).select('isManual sequence').lean();
  const blocked = deleteBlockReason(voyage, siblings);
  if (blocked) throw { status: 400, message: blocked };

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
  createManualVoyage, update, deleteVoyage,
  getAllowedTransitions,
};
