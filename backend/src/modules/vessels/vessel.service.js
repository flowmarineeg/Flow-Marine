'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const pickFields = require('../../utils/pickFields');
const Vessel = require('./vessel.model');
const L = require('./vessel.logic');
const { validateShares } = require('../partners/vesselShares');
const { escapeRegex } = require('../../utils/escapeRegex');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const PARTICULARS_DIR = path.join(__dirname, '../../uploads/vessels');
const SERVER_OWNED = ['particularsFileUrl', 'particularsOriginalName'];

const deleteParticularsFile = (url) => {
  if (!url) return;
  const p = path.join(PARTICULARS_DIR, path.basename(url));
  if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (_) { /* best-effort */ } }
};

/** API body -> storable fields: decimal hire rate becomes integer minor units. */
const prepare = (data) => {
  const d = { ...data };
  if ('defaultDailyHireRate' in d) {
    try { d.defaultDailyHireRateMinor = L.hireRateToMinor(d.defaultDailyHireRate); } catch (_) {
      throw { status: 400, message: 'Default daily hire rate must be a valid amount' };
    }
    delete d.defaultDailyHireRate;
  }
  return d;
};

/** Required-field + charter-date rules, judged on the merged (final) record. */
const assertMasterRules = (merged) => {
  const missing = L.missingRequired(merged);
  if (missing.length) throw { status: 400, message: `Required vessel fields missing: ${missing.join(', ')}` };
  const dateErr = L.charterDateError(merged.charterStartDate, merged.charterEndDate);
  if (dateErr) throw { status: 400, message: dateErr };
};

/** Validates a JV shares payload before any write (throws AppError with the share error codes). */
const checkShares = (shares) => {
  if (shares === undefined) return null;
  const clean = (shares || []).map((s) => ({ partnerId: s.partnerId, shareBp: s.shareBp, isLead: !!s.isLead }));
  validateShares(clean);
  return clean;
};

const withTx = async (fn) => {
  const s = await mongoose.startSession();
  try { let out; await s.withTransaction(async () => { out = await fn(s); }); return out; } finally { s.endSession(); }
};

const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '' } = {}) => {
  const query = {};
  if (status) query.status = status;
  if (search) {
    const rx = escapeRegex(search);
    query.$or = [
      { vesselCode: { $regex: rx, $options: 'i' } },
      { vesselName: { $regex: rx, $options: 'i' } },
      { imoNumber:  { $regex: rx, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    Vessel.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Vessel.countDocuments(query),
  ]);
  return { data: data.map((v) => L.present(v)), total };
};

const getById = async (id) => {
  const vessel = await Vessel.findOne({ _id: id }).lean();
  if (!vessel) throw { status: 404, message: 'Vessel not found' };
  let sharesLocked = false;
  try { await require('../partners/partner.service').assertSharesUnlocked(id); } catch (e) { if (e.code === 'VESSEL_SHARES_LOCKED') sharesLocked = true; else throw e; }
  return { ...L.present(vessel), sharesLocked };
};

const create = async (data, createdBy) => {
  const codeExists = await Vessel.findOne({ vesselCode: data.vesselCode.toUpperCase() });
  if (codeExists) throw { status: 400, message: `Vessel code "${data.vesselCode}" already exists` };

  const imoExists = await Vessel.findOne({ imoNumber: data.imoNumber });
  if (imoExists) throw { status: 400, message: `IMO number "${data.imoNumber}" already registered` };

  const { shares, ...rest } = data;
  const fields = pickFields(Vessel, prepare(rest), SERVER_OWNED);
  assertMasterRules(fields);
  const cleanShares = checkShares(shares);

  // Vessel and its JV shares are saved together or not at all.
  const partnerSvc = require('../partners/partner.service');
  const vessel = await withTx(async (session) => {
    const [doc] = await Vessel.create([{ ...fields, vesselCode: data.vesselCode.toUpperCase(), createdBy }], { session });
    if (cleanShares) await partnerSvc.setShares(doc._id, cleanShares, createdBy, { session });
    return doc;
  });
  return L.present(vessel.toObject());
};

const update = async (id, data, updatedBy) => {
  const vessel = await Vessel.findOne({ _id: id });
  if (!vessel) throw { status: 404, message: 'Vessel not found' };

  if (data.vesselCode && data.vesselCode.toUpperCase() !== vessel.vesselCode) {
    const exists = await Vessel.findOne({ vesselCode: data.vesselCode.toUpperCase(), _id: { $ne: id } });
    if (exists) throw { status: 400, message: `Vessel code "${data.vesselCode}" already exists` };
  }

  if (data.imoNumber && data.imoNumber !== vessel.imoNumber) {
    const imoExists = await Vessel.findOne({ imoNumber: data.imoNumber, _id: { $ne: id } });
    if (imoExists) throw { status: 400, message: `IMO number "${data.imoNumber}" already registered` };
  }

  const { shares, ...rest } = data;
  const fields = pickFields(Vessel, prepare(rest), SERVER_OWNED);
  assertMasterRules({ ...vessel.toObject(), ...fields });
  const cleanShares = checkShares(shares);

  Object.assign(vessel, { ...fields, vesselCode: (data.vesselCode || vessel.vesselCode).toUpperCase(), updatedBy });
  const partnerSvc = require('../partners/partner.service');
  await withTx(async (session) => {
    await vessel.save({ session });
    if (cleanShares) await partnerSvc.setShares(vessel._id, cleanShares, updatedBy, { session });
  });
  return L.present(vessel.toObject());
};

// ─── Particulars PDF ──────────────────────────────────────────────────────────
const setParticulars = async (id, file, updatedBy) => {
  const vessel = await Vessel.findById(id);
  if (!vessel) { fs.existsSync(file.path) && fs.unlinkSync(file.path); throw { status: 404, message: 'Vessel not found' }; }
  deleteParticularsFile(vessel.particularsFileUrl);
  vessel.particularsFileUrl = `/uploads/vessels/${file.filename}`;
  vessel.particularsOriginalName = file.originalname;
  vessel.updatedBy = updatedBy;
  await vessel.save();
  return L.present(vessel.toObject());
};

const clearParticulars = async (id, updatedBy) => {
  const vessel = await Vessel.findById(id);
  if (!vessel) throw { status: 404, message: 'Vessel not found' };
  deleteParticularsFile(vessel.particularsFileUrl);
  vessel.particularsFileUrl = null; vessel.particularsOriginalName = null; vessel.updatedBy = updatedBy;
  await vessel.save();
  return L.present(vessel.toObject());
};

const getParticularsPath = async (id) => {
  const vessel = await Vessel.findById(id).lean();
  if (!vessel) throw { status: 404, message: 'Vessel not found' };
  if (!vessel.particularsFileUrl) throw { status: 404, message: 'No particulars file for this vessel' };
  const absPath = path.join(PARTICULARS_DIR, path.basename(vessel.particularsFileUrl));
  if (!fs.existsSync(absPath)) throw { status: 404, message: 'Particulars file is missing on disk' };
  return { absPath, originalName: vessel.particularsOriginalName || 'particulars.pdf' };
};

const hardDelete = async (id) => {
  const vessel = await Vessel.findOne({ _id: id });
  if (!vessel) throw { status: 404, message: 'Vessel not found' };

  const Round = require('../rounds/round.model');
  const activeRound = await Round.findOne({ vesselId: id, status: { $in: ['Planned', 'Active'] } });
  if (activeRound) throw { status: 400, message: `Cannot delete — vessel is assigned to active round ${activeRound.roundNumber}` };

  // Sprint050 R6 — dependents engine (partner share rows; rounds once accounting is on)
  const { assertNoDependents, DEPENDENTS } = require('../../utils/dependents');
  await assertNoDependents('vessel', id, DEPENDENTS.vessel);

  await Vessel.findByIdAndDelete(id);
  deleteParticularsFile(vessel.particularsFileUrl);
};

const getAll = async (filters = {}, selectedIds = []) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    const rx = escapeRegex(filters.search);
    query.$or = [
      { vesselCode: { $regex: rx, $options: 'i' } },
      { vesselName: { $regex: rx, $options: 'i' } },
    ];
  }
  if (selectedIds && selectedIds.length > 0) query._id = { $in: selectedIds };
  return Vessel.find(query).sort({ createdAt: -1 }).lean();
};

// ─── Vessel stats (for detail page) ─────────────────────────────────────────────────
const getVesselStats = async (id) => {
  const vessel = await Vessel.findOne({ _id: id }).lean();
  if (!vessel) throw { status: 404, message: 'Vessel not found' };

  const Round           = require('../rounds/round.model');
  const Voyage          = require('../voyages/voyage.model');
  const Booking         = require('../bookings/booking.model');
  const ManualBooking   = require('../bookings/manualBooking.model');
  const TrackingHistory = require('../tracking/trackingHistory.model');
  // Lazy require to avoid circular dep (capacity → vessel → capacity)
  const { computeVesselActiveCapacity } = require('../capacity/capacity.service');

  // All rounds for this vessel
  const rounds = await Round.find({ vesselId: id })
    .populate('serviceId', 'serviceCode serviceName')
    .sort({ startDate: -1 })
    .limit(20)
    .lean();
  const roundIds    = rounds.map(r => r._id);
  const totalRounds = await Round.countDocuments({ vesselId: id });

  const activeRoundsCount    = rounds.filter(r => r.status === 'Active').length;
  const plannedRoundsCount   = rounds.filter(r => r.status === 'Planned').length;
  const completedRoundsCount = rounds.filter(r => r.status === 'Completed').length;

  // Voyages for these rounds
  const voyages = await Voyage.find({ roundId: { $in: roundIds } })
    .populate('polId', 'name code')
    .populate('podId', 'name code')
    .sort({ etd: -1 })
    .limit(30)
    .lean();
  const voyageIds    = voyages.map(v => v._id);
  const totalVoyages = await Voyage.countDocuments({ roundId: { $in: roundIds.length ? roundIds : ['000000000000000000000000'] } });
  const activeVoyages = voyages.filter(v => ['Scheduled','Departed','In Transit'].includes(v.status)).length;

  // Booking stats — Sprint 032: combined Layer 1 (ManualBooking) + Layer 2
  // (Booking) per status. Both models share the same BOOKING_STATUS enum,
  // so status labels merge with no reconciliation needed.
  const [l2StatusAgg, l1StatusAgg] = voyageIds.length ? await Promise.all([
    Booking.aggregate([
      { $match: { voyageId: { $in: voyageIds } } },
      { $group: { _id: '$status', count: { $sum: 1 }, totalFreight: { $sum: '$totalFreight' } } },
    ]),
    ManualBooking.aggregate([
      { $match: { voyageId: { $in: voyageIds } } },
      { $group: { _id: '$status', count: { $sum: 1 }, totalFreight: { $sum: '$totalFreight' } } },
    ]),
  ]) : [[], []];

  const statusMap = {};
  [...l2StatusAgg, ...l1StatusAgg].forEach(s => {
    const entry = statusMap[s._id] || { _id: s._id, count: 0, totalFreight: 0 };
    entry.count        += s.count;
    entry.totalFreight += s.totalFreight || 0;
    statusMap[s._id] = entry;
  });
  const bookingStats = Object.values(statusMap);

  let totalBookings = 0, confirmedBookings = 0, pendingBookings = 0, cancelledBookings = 0, finalLoadingBookings = 0;
  let totalRevenue  = 0;
  bookingStats.forEach(s => {
    if (s._id === 'Confirmed')     confirmedBookings    = s.count;
    if (s._id === 'Pending')       pendingBookings      = s.count;
    if (s._id === 'Cancelled')     cancelledBookings    = s.count;
    if (s._id === 'Final Loading') finalLoadingBookings = s.count;
    // Sprint 032: Cancelled excluded from the headline totals — still
    // present in bookingStats/bookingsByStatus as its own status slice.
    if (s._id !== 'Cancelled') {
      totalBookings += s.count;
      totalRevenue  += s.totalFreight || 0;
    }
  });

  // Sprint 022 — per-leg TEU capacity from the capacity engine
  // capacityUsed and capacityPct now reflect peak TEU on the active round,
  // not a flat sum of container quantities. Field names kept for backward compat.
  let capacityUsed  = 0;
  let capacityPct   = null;
  let activeRound   = null;

  try {
    const capResult = await computeVesselActiveCapacity(id);
    activeRound = capResult.activeRound || null;
    if (activeRound) {
      capacityUsed = activeRound.totals?.peakOnboardTEU ?? 0;
      const cap    = vessel.capacity;
      capacityPct  = cap && cap > 0 ? Math.round((capacityUsed / cap) * 100) : null;
    }
  } catch (_) {
    // Non-blocking: capacity engine failure does not break the stats page
  }

  // Agent usage — Sprint 032: combined Layer 1 + Layer 2 per agent, Cancelled excluded.
  const Agent = require('../agents/agent.model');
  const [l2AgentAgg, l1AgentAgg] = voyageIds.length ? await Promise.all([
    Booking.aggregate([
      { $match: { voyageId: { $in: voyageIds }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: '$agentId', bookingCount: { $sum: 1 } } },
    ]),
    ManualBooking.aggregate([
      { $match: { voyageId: { $in: voyageIds }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: '$agentId', bookingCount: { $sum: 1 } } },
    ]),
  ]) : [[], []];

  const agentCountMap = {};
  [...l2AgentAgg, ...l1AgentAgg].forEach(a => {
    const key = String(a._id);
    agentCountMap[key] = (agentCountMap[key] || 0) + a.bookingCount;
  });
  const topAgentIds = Object.entries(agentCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([agentId]) => agentId);

  const agentDocs = topAgentIds.length
    ? await Agent.find({ _id: { $in: topAgentIds } }).select('agentCode agentName').lean()
    : [];
  const agentDocMap = {};
  agentDocs.forEach(a => { agentDocMap[String(a._id)] = a; });
  const agentAgg = topAgentIds.map(agentId => ({
    agentCode:    agentDocMap[agentId]?.agentCode || null,
    agentName:    agentDocMap[agentId]?.agentName || null,
    bookingCount: agentCountMap[agentId],
  }));

  // Recent tracking
  const recentTracking = await TrackingHistory.find({ vesselId: id })
    .populate('portId',    'name code')
    .populate('terminalId','name')
    .populate('voyageId',  'voyageNumber voyageName')
    .populate('serviceId', 'serviceCode')
    .sort({ lastUpdate: -1 })
    .limit(10)
    .lean();

  return {
    vessel,
    stats: {
      totalRounds, activeRoundsCount, plannedRoundsCount, completedRoundsCount,
      totalVoyages, activeVoyages,
      totalBookings, confirmedBookings, pendingBookings, cancelledBookings, finalLoadingBookings,
      totalRevenue,
      // Sprint 022: now TEU-based peak from capacity engine (backward-compat field names)
      capacityUsed,
      capacityPct,
    },
    // Sprint 022: full per-leg capacity payload for the active round
    activeRound,
    rounds:           rounds.slice(0, 10),
    voyages:          voyages.slice(0, 10),
    agents:           agentAgg,
    recentTracking,
    lastPosition:     recentTracking[0] || null,
    bookingsByStatus: bookingStats.map(s => ({ label: s._id, count: s.count })),
  };
};

module.exports = { list, getById, getVesselStats, create, update, hardDelete, getAll, setParticulars, clearParticulars, getParticularsPath };
