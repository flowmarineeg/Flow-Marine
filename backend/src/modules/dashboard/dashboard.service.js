'use strict';

const Vessel   = require('../vessels/vessel.model');
const Agent    = require('../agents/agent.model');
const Round    = require('../rounds/round.model');
const Voyage   = require('../voyages/voyage.model');
const Booking  = require('../bookings/booking.model');
const ManualBooking = require('../bookings/manualBooking.model');
const Invoice  = require('../invoices/invoice.model');
const Expense  = require('../expenses/expense.model');
const AuditLog = require('../auditLogs/auditLog.model');
const cache    = require('../../utils/cache');

const CACHE_KEY = 'dashboard:stats';
const CACHE_TTL = 90_000; // 90 seconds

const computeStats = async () => {
  const now       = new Date();
  const thirty    = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ── All KPI counts in parallel ────────────────────────────────────────────
  const [
    activeVessels, activeRounds, plannedRounds, completedRounds,
    totalVoyages, activeVoyages,
    totalBookings, confirmedBookings, pendingBookings, cancelledBookings,
    totalAgents, draftInvoices, overdueInvoices, paidInvoices, totalExpenses,
    revenueAgg, monthlyTrend, revByService,
    bookingsByStatus, voyagesByStatus, invoicesByStatus, recentActivity,
  ] = await Promise.all([
    Vessel.countDocuments({ status: 'Active',    isDeleted: false }),
    Round.countDocuments({  status: 'Active',    isDeleted: false }),
    Round.countDocuments({  status: 'Planned',   isDeleted: false }),
    Round.countDocuments({  status: 'Completed', isDeleted: false }),
    Voyage.countDocuments({}),
    Voyage.countDocuments({ status: { $in: ['Scheduled', 'Departed', 'In Transit'] } }),
    Booking.countDocuments({ isDeleted: false }),
    Booking.countDocuments({ status: 'Confirmed', isDeleted: false }),
    Booking.countDocuments({ status: 'Pending',   isDeleted: false }),
    Booking.countDocuments({ status: 'Cancelled', isDeleted: false }),
    Agent.countDocuments({   status: 'Active',    isDeleted: false }),
    Invoice.countDocuments({ status: 'Draft',     isDeleted: false }),
    Invoice.countDocuments({ status: 'Overdue',   isDeleted: false }),
    Invoice.countDocuments({ status: 'Paid',      isDeleted: false }),
    Expense.countDocuments({}),
    // aggregations run in same Promise.all — no sequential waits
    Booking.aggregate([
      { $match: { status: 'Confirmed', isDeleted: false, createdAt: { $gte: thirty } } },
      { $group: { _id: null, total: { $sum: '$totalFreight' }, count: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { isDeleted: false, status: { $ne: 'Cancelled' }, createdAt: { $gte: sixMonths } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, totalFreight: { $sum: '$totalFreight' }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Booking.aggregate([
      { $match: { isDeleted: false, status: { $ne: 'Cancelled' } } },
      { $lookup: { from: 'voyages',  localField: 'voyageId',         foreignField: '_id', as: 'voyage'  } },
      { $unwind: { path: '$voyage',  preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'services', localField: 'voyage.serviceId', foreignField: '_id', as: 'service' } },
      { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$voyage.serviceId', serviceCode: { $first: '$service.serviceCode' }, serviceName: { $first: '$service.serviceName' }, revenue: { $sum: '$totalFreight' }, bookings: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
    ]),
    Booking.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Voyage.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Invoice.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    AuditLog.find({}).sort({ timestamp: -1 }).limit(10).populate('userId', 'name email').lean(),
  ]);

  // ── Layer 1 (ManualBooking) counts — Sprint 023 ──────────────────────────
  const [totalManualBookings, pendingManualBookings, confirmedManualBookings, manualRevenueAgg] =
    await Promise.all([
      ManualBooking.countDocuments({ isDeleted: false }),
      ManualBooking.countDocuments({ status: 'Pending',   isDeleted: false }),
      ManualBooking.countDocuments({ status: 'Confirmed', isDeleted: false }),
      ManualBooking.aggregate([
        { $match: { isDeleted: false, status: { $ne: 'Cancelled' }, createdAt: { $gte: thirty } } },
        { $group: { _id: null, total: { $sum: '$totalFreight' } } },
      ]),
    ]);
  const manualRevenue30d = manualRevenueAgg[0]?.total ?? 0;

  // ── Build monthly trend labels ─────────────────────────────────────────────
  const monthLabels = [], monthFreight = [], monthCounts = [];
  for (let i = 5; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('en-GB', { month: 'short', year: '2-digit' });
    const found = monthlyTrend.find(m => m._id.year === d.getFullYear() && m._id.month === (d.getMonth() + 1));
    monthLabels.push(label);
    monthFreight.push(found?.totalFreight ?? 0);
    monthCounts.push(found?.count ?? 0);
  }

  return {
    kpis: {
      activeVessels, activeRounds, plannedRounds, completedRounds,
      totalVoyages, activeVoyages,
      totalBookings, confirmedBookings, pendingBookings, cancelledBookings,
      totalAgents, draftInvoices, overdueInvoices, paidInvoices,
      totalExpenses, revenue30d: revenueAgg[0]?.total ?? 0,
      // Layer 1 (Manual Bookings) — Sprint 023
      totalManualBookings, pendingManualBookings, confirmedManualBookings,
      manualRevenue30d,
    },
    charts: {
      monthlyTrend:     { labels: monthLabels, freight: monthFreight, counts: monthCounts },
      revByService:     revByService.map(r => ({ label: r.serviceCode || 'Unknown', value: r.revenue, bookings: r.bookings, name: r.serviceName })),
      bookingsByStatus: bookingsByStatus.map(r => ({ label: r._id, count: r.count })),
      voyagesByStatus:  voyagesByStatus.map(r => ({ label: r._id, count: r.count })),
      invoicesByStatus: invoicesByStatus.map(r => ({ label: r._id, count: r.count })),
    },
    recentActivity: recentActivity.map(a => ({
      _id:          a._id,
      action:       a.action,
      module:       a.module,
      recordNumber: a.recordNumber || null,
      recordId:     a.recordId     || null,
      user:         a.userId?.name || a.userEmail || 'System',
      timestamp:    a.timestamp,
    })),
  };
};

const getDashboardStats = async () => {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const stats = await computeStats();
  cache.set(CACHE_KEY, stats, CACHE_TTL);
  return stats;
};

// ── Fleet Utilisation (Sprint 022 — SuperAdmin only) ─────────────────────────
/**
 * Returns a summary of per-leg peak TEU utilisation for every Active round.
 * Each entry gives: vessel name, round number, peakOnboardTEU, peakPct,
 * totalBookedTEU, segmentCount and a colour tag for the dashboard widget.
 * Leverages the capacity engine cache — cold call < 100ms per round.
 */
const getFleetUtilisation = async () => {
  const { computeRoundCapacity } = require('../capacity/capacity.service');

  const activeRounds = await Round.find({ status: 'Active', isDeleted: false })
    .populate('vesselId',  'vesselCode vesselName capacity')
    .populate('serviceId', 'serviceCode serviceName')
    .lean();

  const results = await Promise.allSettled(
    activeRounds.map(r => computeRoundCapacity(r._id))
  );

  const items = [];
  results.forEach((res, i) => {
    if (res.status === 'rejected') return; // skip failed computations
    const d        = res.value;
    const r        = activeRounds[i];
    const cap      = d.vessel?.capacity ?? null;
    const peakTEU  = d.totals?.peakOnboardTEU ?? 0;
    const peakPct  = cap && cap > 0 ? Math.round((peakTEU / cap) * 100) : null;
    const color    = peakPct == null ? 'gray'
      : peakPct >= 90 ? 'red'
      : peakPct >= 70 ? 'amber'
      : 'green';
    items.push({
      roundId:        String(r._id),
      roundNumber:    r.roundNumber,
      vesselCode:     d.vessel?.vesselCode,
      vesselName:     d.vessel?.vesselName,
      serviceCode:    d.service?.serviceCode,
      serviceName:    d.service?.serviceName,
      vesselCapacity: cap,
      peakOnboardTEU: peakTEU,
      peakPct,
      totalBookedTEU: d.totals?.totalBookedTEU ?? 0,
      voyageCount:    d.voyages?.length ?? 0,
      warningCount:   d.warnings?.length ?? 0,
      color,
    });
  });

  // Sort: red first, then amber, green, gray
  const ORDER = { red: 0, amber: 1, green: 2, gray: 3 };
  items.sort((a, b) => ORDER[a.color] - ORDER[b.color]);

  return { items, activeRoundCount: activeRounds.length };
};

module.exports = { getDashboardStats, getFleetUtilisation };
