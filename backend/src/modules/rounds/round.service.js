'use strict';

const Round   = require('./round.model');
const Voyage  = require('../voyages/voyage.model');
const Route   = require('../routes/route.model');
const RouteLeg = require('../routes/routeLeg.model');
const Service  = require('../services/service.model');
const { nextNumber } = require('../../utils/autoNumber');
const { generateVoyages } = require('../../utils/voyageGenerator');
const { DEFAULT_PAGE, DEFAULT_LIMIT, ROUND_STATUS } = require('../../config/constants');

// Valid status transitions
const STATUS_TRANSITIONS = {
  Planned:   ['Active', 'Cancelled'],
  Active:    ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
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
const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '', serviceId = '' } = {}) => {
  const query = { isDeleted: false };
  if (status)    query.status    = status;
  if (serviceId) query.serviceId = serviceId;
  if (search) {
    query.$or = [
      { roundNumber: { $regex: search, $options: 'i' } },
      { notes:       { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    Round.find(query)
      .populate('serviceId', 'serviceCode serviceName')
      .populate('vesselId',  'vesselCode vesselName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Round.countDocuments(query),
  ]);

  // Attach voyage count
  const roundIds    = data.map(r => r._id);
  const voyageCounts = await Voyage.aggregate([
    { $match: { roundId: { $in: roundIds } } },
    { $group: { _id: '$roundId', count: { $sum: 1 } } },
  ]);
  const vcMap = {};
  voyageCounts.forEach(vc => { vcMap[String(vc._id)] = vc.count; });

  return {
    data: data.map(r => ({ ...r, voyageCount: vcMap[String(r._id)] || 0 })),
    total,
  };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id) => {
  const round = await Round.findOne({ _id: id, isDeleted: false })
    .populate('serviceId', 'serviceCode serviceName')
    .populate('vesselId',  'vesselCode vesselName')
    .lean();
  if (!round) throw { status: 404, message: 'Round not found' };
  return round;
};

// ─── Get voyages for a round ──────────────────────────────────────────────────
const getRoundVoyages = async (roundId) => {
  const round = await Round.findOne({ _id: roundId, isDeleted: false }).lean();
  if (!round) throw { status: 404, message: 'Round not found' };

  return Voyage.find({ roundId })
    .populate('polId', 'name code')
    .populate('podId', 'name code')
    .sort({ sequence: 1 })
    .lean();
};

// ─── Create (triggers voyage generation) ─────────────────────────────────────
const create = async (data, createdBy) => {
  // 1. Validate service exists and has a route with >= 2 legs
  const service = await Service.findOne({ _id: data.serviceId, isDeleted: false });
  if (!service) throw { status: 400, message: 'Service not found' };

  const route = await Route.findOne({ serviceId: data.serviceId, isDeleted: false });
  if (!route) throw { status: 400, message: 'Service has no route defined. Add at least 2 route legs first.' };

  const routeLegs = await RouteLeg.find({ routeId: route._id })
    .populate('portId', 'name code')
    .sort({ sequence: 1 })
    .lean();

  if (routeLegs.length < 2) {
    throw { status: 400, message: `Service route has only ${routeLegs.length} leg(s). At least 2 required.` };
  }

  // 2. Validate vessel not in another Active round
  const conflictRound = await Round.findOne({
    vesselId: data.vesselId,
    status:   'Active',
    isDeleted: false,
  });
  if (conflictRound) {
    throw {
      status: 400,
      message: `Vessel is already assigned to active round ${conflictRound.roundNumber}`,
    };
  }

  // 3. Validate dates
  if (new Date(data.startDate) >= new Date(data.endDate)) {
    throw { status: 400, message: 'Start date must be before end date' };
  }

  // 4. Generate round number
  const roundNumber = await nextNumber('round');

  // 5. Save round (no voyageIds yet)
  const round = await Round.create({
    roundNumber,
    serviceId: data.serviceId,
    vesselId:  data.vesselId,
    startDate: data.startDate,
    endDate:   data.endDate,
    status:    data.status || 'Planned',
    notes:     data.notes || null,
    voyageIds: [],
    createdBy,
    updatedBy: createdBy,
  });

  // 6. Auto-generate voyages
  const voyages = await generateVoyages(round, routeLegs, service, createdBy);

  // 7. Update round with voyageIds
  round.voyageIds = voyages.map(v => v._id);
  await round.save();

  const populated = await Round.findById(round._id)
    .populate('serviceId', 'serviceCode serviceName')
    .populate('vesselId',  'vesselCode vesselName')
    .lean();

  return { round: populated, voyages };
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const round = await Round.findOne({ _id: id, isDeleted: false });
  if (!round) throw { status: 404, message: 'Round not found' };

  // Do NOT allow service change
  if (data.serviceId && String(data.serviceId) !== String(round.serviceId)) {
    throw { status: 400, message: 'Cannot change service on an existing round' };
  }

  // Status transition validation
  if (data.status && data.status !== round.status) {
    validateTransition(round.status, data.status);
  }

  // Date validation
  const startDate = data.startDate ? new Date(data.startDate) : round.startDate;
  const endDate   = data.endDate   ? new Date(data.endDate)   : round.endDate;
  if (startDate >= endDate) {
    throw { status: 400, message: 'Start date must be before end date' };
  }

  // Vessel conflict check if changing vessel
  if (data.vesselId && String(data.vesselId) !== String(round.vesselId)) {
    const conflict = await Round.findOne({
      vesselId:  data.vesselId,
      status:    'Active',
      isDeleted: false,
      _id:       { $ne: id },
    });
    if (conflict) {
      throw { status: 400, message: `Vessel is in active round ${conflict.roundNumber}` };
    }
  }

  const allowed = ['vesselId', 'startDate', 'endDate', 'status', 'notes'];
  allowed.forEach(field => { if (data[field] !== undefined) round[field] = data[field]; });
  round.updatedBy = updatedBy;
  await round.save();

  return Round.findById(id)
    .populate('serviceId', 'serviceCode serviceName')
    .populate('vesselId',  'vesselCode vesselName')
    .lean();
};

// ─── Soft Delete ──────────────────────────────────────────────────────────────
const softDelete = async (id, deletedBy) => {
  const round = await Round.findOne({ _id: id, isDeleted: false });
  if (!round) throw { status: 404, message: 'Round not found' };

  // Block if any voyage under this round has bookings
  let Booking;
  try { Booking = require('../bookings/booking.model'); } catch { Booking = null; }
  if (Booking) {
    const voyageIds  = round.voyageIds || [];
    const hasBooking = await Booking.exists({ voyageId: { $in: voyageIds }, isDeleted: false });
    if (hasBooking) throw { status: 400, message: 'Cannot delete — one or more voyages have bookings' };
  }

  round.isDeleted = true;
  round.deletedAt = new Date();
  round.updatedBy = deletedBy;
  await round.save();
};

module.exports = { list, getById, getRoundVoyages, create, update, softDelete };
