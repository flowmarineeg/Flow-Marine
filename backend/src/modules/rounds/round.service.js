'use strict';

const Round   = require('./round.model');
const Voyage  = require('../voyages/voyage.model');
const Route   = require('../routes/route.model');
const RouteLeg = require('../routes/routeLeg.model');
const Service  = require('../services/service.model');
const { nextNumber } = require('../../utils/autoNumber');
const { generateVoyages } = require('../../utils/voyageGenerator');
const { invalidateRoundCache } = require('../capacity/capacity.service');
const { escapeRegex } = require('../../utils/escapeRegex');
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

// ── Sprint 042 — Round becomes Active cascades its FIRST voyage (lowest
// sequence, only if currently Scheduled) to Departed. Deliberately scoped to
// just the first voyage, not every voyage in the round — later legs haven't
// physically started and stay Scheduled until an admin advances them
// individually. Deliberately NOT reversible (no revert on later
// Active→Cancelled) and does NOT write a TrackingHistory entry — pure
// status-field change only. 'Departed' is the only valid forward transition
// from 'Scheduled' per voyage.service.js's own STATUS_TRANSITIONS map, so
// only Scheduled voyages are eligible — Cancelled/Completed/already-advanced
// voyages are never touched.
const cascadeFirstVoyageToDeparted = async (roundId, updatedBy) => {
  const firstVoyage = await Voyage.findOne({ roundId, status: 'Scheduled' }).sort({ sequence: 1 });
  if (firstVoyage) {
    firstVoyage.status    = 'Departed';
    firstVoyage.updatedBy = updatedBy;
    await firstVoyage.save();
  }
};

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '', serviceId = '' } = {}) => {
  const query = {};
  if (status)    query.status    = status;
  if (serviceId) query.serviceId = serviceId;
  if (search) {
    const rx = escapeRegex(search);
    query.$or = [
      { roundNumber: { $regex: rx, $options: 'i' } },
      { roundName:   { $regex: rx, $options: 'i' } },
      { notes:       { $regex: rx, $options: 'i' } },
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
  const round = await Round.findOne({ _id: id })
    .populate('serviceId', 'serviceCode serviceName')
    .populate('vesselId',  'vesselCode vesselName')
    .lean();
  if (!round) throw { status: 404, message: 'Round not found' };
  return round;
};

// ─── Get voyages for a round ──────────────────────────────────────────────────
const getRoundVoyages = async (roundId) => {
  const round = await Round.findOne({ _id: roundId }).lean();
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
  const service = await Service.findOne({ _id: data.serviceId });
  if (!service) throw { status: 400, message: 'Service not found' };

  const route = await Route.findOne({ serviceId: data.serviceId });
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
    roundName: data.roundName,
    serviceId: data.serviceId,
    vesselId:  data.vesselId,
    startDate: data.startDate,
    endDate:   data.endDate,
    status:    data.status || 'Planned',
    notes:     data.notes || null,
    voyageIds: [],
    v2: true,
    createdBy,
    updatedBy: createdBy,
  });

  // 6. Auto-generate voyages
  const voyages = await generateVoyages(round, routeLegs, service, createdBy);

  // 7. Update round with voyageIds
  round.voyageIds = voyages.map(v => v._id);
  await round.save();

  // Sprint 042 — Round created directly with status Active cascades its
  // first voyage to Departed (see cascadeFirstVoyageToDeparted comment).
  if (round.status === 'Active') {
    await cascadeFirstVoyageToDeparted(round._id, createdBy);
  }

  const populated = await Round.findById(round._id)
    .populate('serviceId', 'serviceCode serviceName')
    .populate('vesselId',  'vesselCode vesselName')
    .lean();

  return { round: populated, voyages };
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  await require('./roundLock').assertRoundOpen(id);
  const round = await Round.findOne({ _id: id });
  if (!round) throw { status: 404, message: 'Round not found' };

  // Do NOT allow service change
  if (data.serviceId && String(data.serviceId) !== String(round.serviceId)) {
    throw { status: 400, message: 'Cannot change service on an existing round' };
  }

  // Status transition validation
  if (data.status && data.status !== round.status) {
    validateTransition(round.status, data.status);
  }

  // Sprint 042 — captured BEFORE round.status is overwritten below.
  const becameActive = data.status === 'Active' && round.status !== 'Active';

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
      _id:       { $ne: id },
    });
    if (conflict) {
      throw { status: 400, message: `Vessel is in active round ${conflict.roundNumber}` };
    }
  }

  const allowed = ['vesselId', 'startDate', 'endDate', 'status', 'notes', 'roundName'];
  allowed.forEach(field => { if (data[field] !== undefined) round[field] = data[field]; });
  round.updatedBy = updatedBy;
  await round.save();

  // Invalidate capacity cache — vessel, dates, or status may have changed
  invalidateRoundCache(id);

  // Sprint 042 — Planned→Active transition cascades the round's first
  // voyage to Departed (see cascadeFirstVoyageToDeparted comment).
  if (becameActive) {
    await cascadeFirstVoyageToDeparted(id, updatedBy);
  }

  return Round.findById(id)
    .populate('serviceId', 'serviceCode serviceName')
    .populate('vesselId',  'vesselCode vesselName')
    .lean();
};

// ─── Hard Delete ──────────────────────────────────────────────────────────────
// A Round's Voyages have no independent existence outside their Round (they
// are auto-generated from it and exclusively owned by it, per
// utils/voyageGenerator.js) — so deleting a Round also removes its own
// Voyage documents, once the guards below confirm none of them are
// referenced by Layer 2 Bookings, Layer 1 ManualBookings, or Expenses
// (Round- or Voyage-scoped) — every entity that would otherwise be
// silently orphaned by the Voyage cascade. This does NOT reach any further
// down the graph (Invoice etc. are untouched — Booking's own guard already
// blocks its own delete if a non-cancelled Invoice references it, so an
// invoiced Booking blocks this Round delete transitively) — narrow,
// exclusive-ownership cleanup, not a generic cascade.
const hardDelete = async (id) => {
  await require('./roundLock').assertRoundOpen(id);
  const round = await Round.findOne({ _id: id });
  if (!round) throw { status: 404, message: 'Round not found' };

  const voyageIds = round.voyageIds || [];

  // Block if any voyage under this round has Layer 2 (Operational) bookings
  let Booking;
  try { Booking = require('../bookings/booking.model'); } catch { Booking = null; }
  if (Booking) {
    const hasBooking = await Booking.exists({ voyageId: { $in: voyageIds } });
    if (hasBooking) throw { status: 400, message: 'Cannot delete — one or more voyages have bookings' };
  }

  // Same check, Layer 1 (Estimated/ManualBooking) — the Voyage cascade below
  // would otherwise silently orphan a live commercial reservation that has
  // no independent existence once its voyage is gone.
  let ManualBooking;
  try { ManualBooking = require('../bookings/manualBooking.model'); } catch { ManualBooking = null; }
  if (ManualBooking) {
    const hasManualBooking = await ManualBooking.exists({ voyageId: { $in: voyageIds } });
    if (hasManualBooking) throw { status: 400, message: 'Cannot delete — one or more voyages have estimated bookings' };
  }

  // Expenses can be scoped to the Round itself (roundId) or to one of its
  // Voyages (voyageId) — either would otherwise be orphaned by the cascade.
  let Expense;
  try { Expense = require('../expenses/expense.model'); } catch { Expense = null; }
  if (Expense) {
    const hasExpense = await Expense.exists({ $or: [{ roundId: id }, { voyageId: { $in: voyageIds } }] });
    if (hasExpense) throw { status: 400, message: 'Cannot delete — expenses are recorded against this round or its voyages' };
  }

  // Audit H5: ledger lines / settlements / reserve / posted expenses / invoiced items block the delete
  const { assertNoDependents, DEPENDENTS } = require('../../utils/dependents');
  await assertNoDependents('round', id, DEPENDENTS.round);
  await assertNoDependents('voyage', { $in: voyageIds }, DEPENDENTS.voyage);
  await require('mongoose').model('PartnerTransfer').deleteMany({ roundId: id, status: 'Suggested' }).catch(() => {});
  await require('mongoose').model('PartnerSettlement').deleteMany({ roundId: id, status: 'Draft' }).catch(() => {});
  await require('mongoose').model('BookingItem').deleteMany({ $or: [{ roundId: id }, { voyageId: { $in: voyageIds } }], locked: false }).catch(() => {});

  if (voyageIds.length) await Voyage.deleteMany({ _id: { $in: voyageIds } });
  await Round.findByIdAndDelete(id);
};

module.exports = { list, getById, getRoundVoyages, create, update, hardDelete };
