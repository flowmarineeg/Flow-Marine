'use strict';

const mongoose = require('mongoose');
const Round   = require('./round.model');
const Voyage  = require('../voyages/voyage.model');
const Route   = require('../routes/route.model');
const RouteLeg = require('../routes/routeLeg.model');
const Service  = require('../services/service.model');
const Vessel   = require('../vessels/vessel.model');
const AppError = require('../../utils/AppError');
const { assertInitialStatus, buildRouteSnapshot, CANCELLABLE_VOYAGE_STATUSES } = require('./round.logic');
const { assertNoConsecutivePorts } = require('../routes/routeLegs.logic');
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
// Reconciled with the voyage rule "Departed needs an ATD" (RV-18..20): the cascade stamps the activation
// time as the actual departure when none was recorded. An ATD that is already set is never overwritten.
const cascadeFirstVoyageToDeparted = async (roundId, updatedBy, session = null) => {
  const firstVoyage = await Voyage.findOne({ roundId, status: 'Scheduled' }).sort({ sequence: 1 }).session(session);
  if (firstVoyage) {
    firstVoyage.status    = 'Departed';
    firstVoyage.atd       = firstVoyage.atd || new Date();
    firstVoyage.updatedBy = updatedBy;
    await firstVoyage.save({ session });
  }
};

// Run `fn(session)` in a transaction and translate the Active-round unique index into a domain error.
const runRoundTx = async (fn) => {
  try {
    return await mongoose.connection.transaction(fn);
  } catch (err) {
    if (err && err.code === 11000 && String(err.message).includes('one_active_round_per_vessel')) {
      throw new AppError(409, 'This vessel already has an Active round', 'VESSEL_HAS_ACTIVE_ROUND');
    }
    throw err;
  }
};

// A vessel can be on at most one Active round (RV-07). `exceptRoundId` skips the round being updated.
const assertVesselFree = async (vesselId, exceptRoundId = null) => {
  const q = { vesselId, status: 'Active' };
  if (exceptRoundId) q._id = { $ne: exceptRoundId };
  const conflict = await Round.findOne(q).select('roundNumber').lean();
  if (conflict) {
    throw new AppError(409, `Vessel is already assigned to active round ${conflict.roundNumber}`, 'VESSEL_HAS_ACTIVE_ROUND');
  }
};

// Cancelling a round never touches bookings: refuse while any non-Cancelled booking (Layer 1 or 2) exists (RV-25).
const assertNoLiveBookings = async (round) => {
  const voyageIds = round.voyageIds || [];
  if (!voyageIds.length) return;
  const Booking = require('../bookings/booking.model');
  const ManualBooking = require('../bookings/manualBooking.model');
  const q = { voyageId: { $in: voyageIds }, status: { $ne: 'Cancelled' } };
  const [layer2, layer1] = await Promise.all([Booking.countDocuments(q), ManualBooking.countDocuments(q)]);
  if (layer2 + layer1 > 0) {
    throw new AppError(
      409,
      `Cannot cancel round ${round.roundNumber} — ${layer2} booking(s) and ${layer1} estimated booking(s) are still live on its voyages. Cancel or move them first, then cancel the round.`,
      'ROUND_HAS_BOOKINGS'
    );
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
// Round + voyages + voyageIds + first-voyage cascade commit together or not at all (RV-32). The round
// number comes from an atomic counter OUTSIDE the transaction: a rolled-back create burns a number
// (a gap is acceptable, a duplicate is impossible). generateVoyages is untouched (R10); it joins the
// transaction through mongoose's transactionAsyncLocalStorage (config/db.js).
const create = async (data, createdBy) => {
  const status = assertInitialStatus(data.status);

  // 1. Validate every reference before any write (RV-01/02/03)
  const service = await Service.findOne({ _id: data.serviceId });
  if (!service) throw { status: 400, message: 'Service not found' };
  if (service.status !== 'Active') throw { status: 400, message: 'Service is not Active' };

  const vessel = await Vessel.findOne({ _id: data.vesselId }).select('status vesselName').lean();
  if (!vessel) throw { status: 400, message: 'Vessel not found' };
  if (vessel.status !== 'Active') throw { status: 400, message: `Vessel is not Active (${vessel.status})` };

  const route = await Route.findOne({ serviceId: data.serviceId });
  if (!route) throw { status: 400, message: 'Service has no route defined. Add at least 2 route legs first.' };

  const routeLegs = await RouteLeg.find({ routeId: route._id })
    .populate('portId', 'name code')
    .sort({ sequence: 1 })
    .lean();

  if (routeLegs.length < 2) {
    throw { status: 400, message: `Service route has only ${routeLegs.length} leg(s). At least 2 required.` };
  }
  // Legacy routes saved before the RV-08/09 rule would generate a voyage with POL = POD.
  assertNoConsecutivePorts(routeLegs.map((l) => ({ portId: l.portId?._id || l.portId })));

  // 2. Validate vessel not in another Active round
  await assertVesselFree(data.vesselId);

  // 3. Validate dates
  if (new Date(data.startDate) >= new Date(data.endDate)) {
    throw { status: 400, message: 'Start date must be before end date' };
  }

  // 4. Generate round number (outside the transaction, see above)
  const roundNumber = await nextNumber('round');

  // 5. Round + voyages + voyageIds (+ cascade) atomically
  const result = await runRoundTx(async (session) => {
    const [round] = await Round.create([{
      roundNumber,
      roundName: data.roundName,
      serviceId: data.serviceId,
      vesselId:  data.vesselId,
      startDate: data.startDate,
      endDate:   data.endDate,
      status,
      notes:     data.notes || null,
      voyageIds: [],
      routeSnapshot: buildRouteSnapshot(route._id, routeLegs),
      v2: true,
      createdBy,
      updatedBy: createdBy,
    }], { session });

    const voyages = await generateVoyages(round, routeLegs, service, createdBy);

    round.voyageIds     = voyages.map(v => v._id);
    round.lastVoyageSeq = voyages.length;
    await round.save({ session });

    // Sprint 042 — Round created directly with status Active cascades its
    // first voyage to Departed (see cascadeFirstVoyageToDeparted comment).
    if (status === 'Active') await cascadeFirstVoyageToDeparted(round._id, createdBy, session);

    return { roundId: round._id, voyages };
  });

  const populated = await Round.findById(result.roundId)
    .populate('serviceId', 'serviceCode serviceName')
    .populate('vesselId',  'vesselCode vesselName')
    .lean();

  return { round: populated, voyages: result.voyages };
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
  const statusChanges = data.status && data.status !== round.status;
  if (statusChanges) {
    validateTransition(round.status, data.status);
  }

  // Sprint 042 — captured BEFORE round.status is overwritten below.
  const becameActive = data.status === 'Active' && round.status !== 'Active';
  const becameCancelled = statusChanges && data.status === 'Cancelled';

  // Date validation
  const startDate = data.startDate ? new Date(data.startDate) : round.startDate;
  const endDate   = data.endDate   ? new Date(data.endDate)   : round.endDate;
  if (startDate >= endDate) {
    throw { status: 400, message: 'Start date must be before end date' };
  }

  // Vessel: must exist and be Active when it changes (RV-01/03)
  const vesselChanged = data.vesselId && String(data.vesselId) !== String(round.vesselId);
  if (vesselChanged) {
    const vessel = await Vessel.findOne({ _id: data.vesselId }).select('status').lean();
    if (!vessel) throw { status: 400, message: 'Vessel not found' };
    if (vessel.status !== 'Active') throw { status: 400, message: `Vessel is not Active (${vessel.status})` };
  }

  // One Active round per vessel: checked on a vessel change AND whenever the round becomes Active (RV-07).
  // The partial unique index closes the race between two concurrent requests (RV-34).
  if (vesselChanged || becameActive) {
    await assertVesselFree(data.vesselId || round.vesselId, id);
  }

  // Cancelling is refused while live bookings exist; bookings are never auto-cancelled (RV-25).
  if (becameCancelled) await assertNoLiveBookings(round);

  const allowed = ['vesselId', 'startDate', 'endDate', 'status', 'notes', 'roundName'];
  allowed.forEach(field => { if (data[field] !== undefined) round[field] = data[field]; });
  round.updatedBy = updatedBy;

  await runRoundTx(async (session) => {
    await round.save({ session });
    if (becameCancelled) {
      // Voyages that can still be cancelled follow the round; Arrived/Completed stay as history.
      await Voyage.updateMany(
        { roundId: id, status: { $in: CANCELLABLE_VOYAGE_STATUSES } },
        { $set: { status: 'Cancelled', updatedBy } },
        { session }
      );
    }
    // Sprint 042 — Planned→Active transition cascades the round's first
    // voyage to Departed (see cascadeFirstVoyageToDeparted comment).
    if (becameActive) await cascadeFirstVoyageToDeparted(id, updatedBy, session);
  });

  // Invalidate capacity cache — vessel, dates, or status may have changed
  invalidateRoundCache(id);

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
// Guards and cleanup run in ONE transaction (RV-37): a failed cleanup aborts the delete instead of being
// swallowed, so the call never reports success while records remain.
const hardDelete = async (id) => {
  await require('./roundLock').assertRoundOpen(id);
  const round = await Round.findOne({ _id: id });
  if (!round) throw { status: 404, message: 'Round not found' };

  const voyageIds = round.voyageIds || [];
  const mongoose = require('mongoose');

  await runRoundTx(async (session) => {
    // Block if any voyage under this round has Layer 2 (Operational) bookings
    let Booking;
    try { Booking = require('../bookings/booking.model'); } catch { Booking = null; }
    if (Booking) {
      const hasBooking = await Booking.exists({ voyageId: { $in: voyageIds } }).session(session);
      if (hasBooking) throw { status: 400, message: 'Cannot delete — one or more voyages have bookings' };
    }

    // Same check, Layer 1 (Estimated/ManualBooking) — the Voyage cascade below
    // would otherwise silently orphan a live commercial reservation that has
    // no independent existence once its voyage is gone.
    let ManualBooking;
    try { ManualBooking = require('../bookings/manualBooking.model'); } catch { ManualBooking = null; }
    if (ManualBooking) {
      const hasManualBooking = await ManualBooking.exists({ voyageId: { $in: voyageIds } }).session(session);
      if (hasManualBooking) throw { status: 400, message: 'Cannot delete — one or more voyages have estimated bookings' };
    }

    // Expenses can be scoped to the Round itself (roundId) or to one of its
    // Voyages (voyageId) — either would otherwise be orphaned by the cascade.
    let Expense;
    try { Expense = require('../expenses/expense.model'); } catch { Expense = null; }
    if (Expense) {
      const hasExpense = await Expense.exists({ $or: [{ roundId: id }, { voyageId: { $in: voyageIds } }] }).session(session);
      if (hasExpense) throw { status: 400, message: 'Cannot delete — expenses are recorded against this round or its voyages' };
    }

    // Audit H5: ledger lines / settlements / reserve / posted expenses / invoiced items block the delete
    const { assertNoDependents, DEPENDENTS } = require('../../utils/dependents');
    await assertNoDependents('round', id, DEPENDENTS.round, { session });
    await assertNoDependents('voyage', { $in: voyageIds }, DEPENDENTS.voyage, { session });
    await mongoose.model('PartnerTransfer').deleteMany({ roundId: id, status: 'Suggested' }, { session });
    await mongoose.model('PartnerSettlement').deleteMany({ roundId: id, status: 'Draft' }, { session });
    await mongoose.model('BookingItem').deleteMany({ $or: [{ roundId: id }, { voyageId: { $in: voyageIds } }], locked: false }, { session });

    if (voyageIds.length) await Voyage.deleteMany({ _id: { $in: voyageIds } }, { session });
    await Round.findByIdAndDelete(id, { session });
  });

  invalidateRoundCache(id);
};

module.exports = { list, getById, getRoundVoyages, create, update, hardDelete };
