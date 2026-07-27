'use strict';

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

// ─── Get ports available for a round (from its service route legs) ────────────
const getRoundRoutePorts = async (roundId) => {
  const round = await Round.findOne({ _id: roundId, isDeleted: false }).lean();
  if (!round) throw { status: 404, message: 'Round not found' };

  const route = await Route.findOne({ serviceId: round.serviceId, isDeleted: false }).lean();
  if (!route) throw { status: 404, message: 'No route found for this service' };

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

// ─── Create Manual Voyage ─────────────────────────────────────────────────────
const createManualVoyage = async (roundId, data, createdBy) => {
  // 1. Load and validate round
  const round = await Round.findOne({ _id: roundId, isDeleted: false }).lean();
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

  // 4. Validate both ports are in the service route legs
  const route = await Route.findOne({ serviceId: round.serviceId, isDeleted: false }).lean();
  if (!route) throw { status: 400, message: 'Service has no route defined' };

  const polLeg = await RouteLeg.findOne({ routeId: route._id, portId: polId }).lean();
  if (!polLeg) throw { status: 400, message: 'POL is not in the service route legs' };

  const podLeg = await RouteLeg.findOne({ routeId: route._id, portId: podId }).lean();
  if (!podLeg) throw { status: 400, message: 'POD is not in the service route legs' };

  // 5. Determine next sequence number
  const lastVoyage = await Voyage.findOne({ roundId }).sort({ sequence: -1 }).lean();
  const sequence   = (lastVoyage?.sequence || 0) + 1;

  // 6. Generate voyage number
  const voyageNumber = `${service.serviceCode}-${round.roundNumber}-${String(sequence).padStart(2, '0')}`;

  // 7. Check voyage number uniqueness (edge case)
  const numExists = await Voyage.findOne({ voyageNumber }).lean();
  if (numExists) {
    // Append suffix to avoid collision
    const safeName = `${voyageNumber}-M`;
    const safeExists = await Voyage.findOne({ voyageNumber: safeName }).lean();
    if (safeExists) throw { status: 400, message: 'Could not generate a unique voyage number. Please retry.' };
  }

  // 8. Create voyage
  const voyage = await Voyage.create({
    voyageNumber:   numExists ? `${voyageNumber}-M` : voyageNumber,
    voyageCode:     data.voyageCode  || null,
    voyageName:     data.voyageName  || null,
    roundId,
    serviceId:      round.serviceId,
    polId,
    podId,
    sequence,
    etd:            data.etd  || null,
    eta:            data.eta  || null,
    etp:            data.etp  || null,
    atd:            data.atd  || null,
    ata:            data.ata  || null,
    status:         data.status || 'Scheduled',
    isManual:       true,
    createdBy,
    updatedBy:      createdBy,
  });

  // 9. Add to round.voyageIds
  await Round.findByIdAndUpdate(roundId, { $push: { voyageIds: voyage._id } });

  return Voyage.findById(voyage._id)
    .populate('polId', 'name code')
    .populate('podId', 'name code')
    .lean();
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const voyage = await Voyage.findById(id);
  if (!voyage) throw { status: 404, message: 'Voyage not found' };

  if (data.status && data.status !== voyage.status) {
    validateTransition(voyage.status, data.status);
  }

  // Extended allowed fields: now includes etp and voyageCode
  const allowed = ['etd', 'eta', 'etp', 'atd', 'ata', 'status', 'voyageCode', 'voyageName'];
  allowed.forEach(field => {
    if (data[field] !== undefined) voyage[field] = data[field] || null;
  });
  voyage.updatedBy = updatedBy;
  await voyage.save();

  // Invalidate capacity cache for this round (status change affects engine output)
  invalidateRoundCache(voyage.roundId);

  return Voyage.findById(id)
    .populate('roundId',   'roundNumber roundName')
    .populate('serviceId', 'serviceCode serviceName')
    .populate('polId',     'name code')
    .populate('podId',     'name code')
    .lean();
};

// ─── Delete Voyage (hard delete, guarded by bookings) ────────────────────────
const deleteVoyage = async (id) => {
  const voyage = await Voyage.findById(id).lean();
  if (!voyage) throw { status: 404, message: 'Voyage not found' };

  // Block if any active (non-Cancelled) bookings exist
  let Booking;
  try { Booking = require('../bookings/booking.model'); } catch { Booking = null; }

  if (Booking) {
    const hasBookings = await Booking.exists({
      voyageId:  id,
      isDeleted: false,
      status:    { $ne: 'Cancelled' },
    });
    if (hasBookings) {
      throw { status: 400, message: 'Cannot delete — voyage has active bookings. Cancel the bookings first.' };
    }
  }

  // Remove from Round.voyageIds
  await Round.findByIdAndUpdate(voyage.roundId, { $pull: { voyageIds: voyage._id } });

  // Hard delete
  await Voyage.findByIdAndDelete(id);
};

// ─── Get allowed next statuses ────────────────────────────────────────────────
const getAllowedTransitions = (currentStatus) => STATUS_TRANSITIONS[currentStatus] || [];

module.exports = {
  list, getById, getRoundRoutePorts,
  createManualVoyage, update, deleteVoyage,
  getAllowedTransitions,
};
