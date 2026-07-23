'use strict';

const Vessel = require('./vessel.model');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '' } = {}) => {
  const query = { isDeleted: false };
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { vesselCode: { $regex: search, $options: 'i' } },
      { vesselName: { $regex: search, $options: 'i' } },
      { imoNumber:  { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    Vessel.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Vessel.countDocuments(query),
  ]);
  return { data, total };
};

const getById = async (id) => {
  const vessel = await Vessel.findOne({ _id: id, isDeleted: false }).lean();
  if (!vessel) throw { status: 404, message: 'Vessel not found' };
  return vessel;
};

const create = async (data, createdBy) => {
  const codeExists = await Vessel.findOne({ vesselCode: data.vesselCode.toUpperCase() });
  if (codeExists) throw { status: 400, message: `Vessel code "${data.vesselCode}" already exists` };

  const imoExists = await Vessel.findOne({ imoNumber: data.imoNumber });
  if (imoExists) throw { status: 400, message: `IMO number "${data.imoNumber}" already registered` };

  if (data.ownershipType === 'Chartered') {
    if (!data.charterStartDate || !data.charterEndDate)
      throw { status: 400, message: 'Charter start and end dates are required for Chartered vessels' };
    if (new Date(data.charterStartDate) >= new Date(data.charterEndDate))
      throw { status: 400, message: 'Charter start date must be before end date' };
  }

  const vessel = await Vessel.create({ ...data, vesselCode: data.vesselCode.toUpperCase(), createdBy });
  return vessel.toObject();
};

const update = async (id, data, updatedBy) => {
  const vessel = await Vessel.findOne({ _id: id, isDeleted: false });
  if (!vessel) throw { status: 404, message: 'Vessel not found' };

  if (data.vesselCode && data.vesselCode.toUpperCase() !== vessel.vesselCode) {
    const exists = await Vessel.findOne({ vesselCode: data.vesselCode.toUpperCase(), _id: { $ne: id } });
    if (exists) throw { status: 400, message: `Vessel code "${data.vesselCode}" already exists` };
  }

  if (data.imoNumber && data.imoNumber !== vessel.imoNumber) {
    const imoExists = await Vessel.findOne({ imoNumber: data.imoNumber, _id: { $ne: id } });
    if (imoExists) throw { status: 400, message: `IMO number "${data.imoNumber}" already registered` };
  }

  const ownershipType = data.ownershipType || vessel.ownershipType;
  if (ownershipType === 'Chartered') {
    const start = data.charterStartDate || vessel.charterStartDate;
    const end   = data.charterEndDate   || vessel.charterEndDate;
    if (!start || !end) throw { status: 400, message: 'Charter start and end dates are required for Chartered vessels' };
    if (new Date(start) >= new Date(end)) throw { status: 400, message: 'Charter start date must be before end date' };
  }

  Object.assign(vessel, { ...data, vesselCode: (data.vesselCode || vessel.vesselCode).toUpperCase(), updatedBy });
  await vessel.save();
  return vessel.toObject();
};

const softDelete = async (id, deletedBy) => {
  const vessel = await Vessel.findOne({ _id: id, isDeleted: false });
  if (!vessel) throw { status: 404, message: 'Vessel not found' };

  const Round = require('../rounds/round.model');
  const activeRound = await Round.findOne({ vesselId: id, status: { $in: ['Planned', 'Active'] }, isDeleted: false });
  if (activeRound) throw { status: 400, message: `Cannot delete — vessel is assigned to active round ${activeRound.roundNumber}` };

  vessel.isDeleted = true;
  vessel.deletedAt = new Date();
  vessel.updatedBy = deletedBy;
  await vessel.save();
};

const getAll = async (filters = {}, selectedIds = []) => {
  const query = { isDeleted: false };
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    query.$or = [
      { vesselCode: { $regex: filters.search, $options: 'i' } },
      { vesselName: { $regex: filters.search, $options: 'i' } },
    ];
  }
  if (selectedIds && selectedIds.length > 0) query._id = { $in: selectedIds };
  return Vessel.find(query).sort({ createdAt: -1 }).lean();
};

// ─── Vessel stats (for detail page) ─────────────────────────────────────────────────
const getVesselStats = async (id) => {
  const vessel = await Vessel.findOne({ _id: id, isDeleted: false }).lean();
  if (!vessel) throw { status: 404, message: 'Vessel not found' };

  const Round           = require('../rounds/round.model');
  const Voyage          = require('../voyages/voyage.model');
  const Booking         = require('../bookings/booking.model');
  const ManualBooking   = require('../bookings/manualBooking.model');
  const TrackingHistory = require('../tracking/trackingHistory.model');
  // Lazy require to avoid circular dep (capacity → vessel → capacity)
  const { computeVesselActiveCapacity } = require('../capacity/capacity.service');

  // All rounds for this vessel
  const rounds = await Round.find({ vesselId: id, isDeleted: false })
    .populate('serviceId', 'serviceCode serviceName')
    .sort({ startDate: -1 })
    .limit(20)
    .lean();
  const roundIds    = rounds.map(r => r._id);
  const totalRounds = await Round.countDocuments({ vesselId: id, isDeleted: false });

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
      { $match: { voyageId: { $in: voyageIds }, isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 }, totalFreight: { $sum: '$totalFreight' } } },
    ]),
    ManualBooking.aggregate([
      { $match: { voyageId: { $in: voyageIds }, isDeleted: false } },
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
      { $match: { voyageId: { $in: voyageIds }, isDeleted: false, status: { $ne: 'Cancelled' } } },
      { $group: { _id: '$agentId', bookingCount: { $sum: 1 } } },
    ]),
    ManualBooking.aggregate([
      { $match: { voyageId: { $in: voyageIds }, isDeleted: false, status: { $ne: 'Cancelled' } } },
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
    .populate('voyageId',  'voyageNumber')
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

module.exports = { list, getById, getVesselStats, create, update, softDelete, getAll };
