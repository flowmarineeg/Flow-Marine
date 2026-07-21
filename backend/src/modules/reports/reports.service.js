'use strict';

const mongoose   = require('mongoose');
const Round      = require('../rounds/round.model');
const Voyage     = require('../voyages/voyage.model');
const Booking    = require('../bookings/booking.model');
const ManualBooking = require('../bookings/manualBooking.model');
const Expense    = require('../expenses/expense.model');
const Service    = require('../services/service.model');

// ─── helpers ──────────────────────────────────────────────────────────────────
const toObjId = (id) => new mongoose.Types.ObjectId(String(id));
const dateRange = (from, to) => {
  const q = {};
  if (from) q.$gte = new Date(from);
  if (to)   q.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  return Object.keys(q).length ? q : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Report 1 — Round P&L
// ─────────────────────────────────────────────────────────────────────────────
const getRoundPnL = async ({ roundId } = {}) => {
  if (!roundId) throw { status: 400, message: 'roundId is required' };

  const round = await Round.findOne({ _id: roundId, isDeleted: false })
    .populate('serviceId', 'serviceCode serviceName')
    .populate('vesselId',  'vesselCode vesselName')
    .lean();
  if (!round) throw { status: 404, message: 'Round not found' };

  const voyageIds = round.voyageIds || [];

  // Revenue — sum of booking.totalFreight for all voyages in this round
  const revenueAgg = await Booking.aggregate([
    { $match: { voyageId: { $in: voyageIds }, isDeleted: false, status: { $ne: 'Cancelled' } } },
    { $group: {
        _id:          null,
        totalRevenue: { $sum: '$totalFreight' },
        bookingCount: { $sum: 1 },
        totalQty:     { $sum: '$quantity' },
    }},
  ]);

  // Expenses — roundId-linked + voyageId-linked
  const expenseAgg = await Expense.aggregate([
    {
      $match: {
        $or: [
          { roundId:  toObjId(roundId) },
          { voyageId: { $in: voyageIds } },
        ],
      },
    },
    {
      $lookup: {
        from:         'expensetypes',
        localField:   'expenseTypeId',
        foreignField: '_id',
        as:           'expenseType',
      },
    },
    // FIX: was preserveNullAndEmpty (invalid) → preserveNullAndEmptyArrays
    { $unwind: { path: '$expenseType', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id:   { category: '$expenseType.category', currency: '$currency' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.category': 1, '_id.currency': 1 } },
  ]);

  const rev = revenueAgg[0] || { totalRevenue: 0, bookingCount: 0, totalQty: 0 };

  // Layer 1 — Manual Bookings (Pending + Confirmed + FL count toward revenue)
  const l1Agg = await ManualBooking.aggregate([
    { $match: { voyageId: { $in: voyageIds }, isDeleted: false, status: { $ne: 'Cancelled' } } },
    { $group: { _id: null, totalRevenue: { $sum: '$totalFreight' }, totalUnits: { $sum: '$totalUnits' }, count: { $sum: 1 } } },
  ]);
  const l1 = l1Agg[0] || { totalRevenue: 0, totalUnits: 0, count: 0 };

  const expenseBreakdown = expenseAgg.map(e => ({
    category: e._id.category || 'Uncategorised',
    currency: e._id.currency,
    total:    e.total,
    count:    e.count,
  }));

  const expenseTotals = {};
  expenseBreakdown.forEach(({ currency, total }) => {
    expenseTotals[currency] = (expenseTotals[currency] || 0) + total;
  });

  return {
    round: {
      _id:         round._id,
      roundNumber: round.roundNumber,
      status:      round.status,
      startDate:   round.startDate,
      endDate:     round.endDate,
      service:     round.serviceId,
      vessel:      round.vesselId,
    },
    voyageCount:   voyageIds.length,
    // Layer 2 (operational) counts
    bookingCount:  rev.bookingCount,
    totalQuantity: rev.totalQty,
    // Layer 1 (manual / commercial) — added Sprint 023
    manualBookingCount:    l1.count,
    manualTotalUnits:      l1.totalUnits,
    // Combined revenue (L1 + L2)
    totalRevenue:  rev.totalRevenue + l1.totalRevenue,
    l2Revenue:     rev.totalRevenue,
    l1Revenue:     l1.totalRevenue,
    expenseTotals,
    expenseBreakdown,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Report 2 — Voyage Performance
// ─────────────────────────────────────────────────────────────────────────────
const getVoyagePerformance = async ({ voyageId, serviceId, roundId, status, dateFrom, dateTo } = {}) => {
  const match = {};
  if (voyageId)  match._id       = toObjId(voyageId);
  if (serviceId) match.serviceId = toObjId(serviceId);
  if (roundId)   match.roundId   = toObjId(roundId);
  if (status)    match.status    = status;
  const dr = dateRange(dateFrom, dateTo);
  if (dr) match.etd = dr;

  const rows = await Voyage.aggregate([
    { $match: match },
    {
      $lookup: {
        from:     'bookings',
        let:      { vid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ['$voyageId', '$$vid'] },
            { $eq: ['$isDeleted', false] },
            { $ne:  ['$status', 'Cancelled'] },
          ]}}},
          { $group: {
              _id:          null,
              bookingCount: { $sum: 1 },
              totalFreight: { $sum: '$totalFreight' },
              totalQty:     { $sum: '$quantity' },
          }},
        ],
        as: 'bookingSummary',
      },
    },
    // FIX: was preserveNullAndEmpty (invalid) → preserveNullAndEmptyArrays
    { $unwind: { path: '$bookingSummary', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'rounds',   localField: 'roundId',   foreignField: '_id', as: 'round'   } },
    { $lookup: { from: 'services', localField: 'serviceId', foreignField: '_id', as: 'service' } },
    { $lookup: { from: 'ports',    localField: 'polId',     foreignField: '_id', as: 'pol'     } },
    { $lookup: { from: 'ports',    localField: 'podId',     foreignField: '_id', as: 'pod'     } },
    // FIX: all four were preserveNullAndEmpty → preserveNullAndEmptyArrays
    { $unwind: { path: '$round',   preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$pol',     preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$pod',     preserveNullAndEmptyArrays: true } },
    {
      $project: {
        voyageNumber:  1, status: 1, etd: 1, eta: 1, sequence: 1,
        polName:       '$pol.name',
        podName:       '$pod.name',
        roundNumber:   '$round.roundNumber',
        serviceCode:   '$service.serviceCode',
        serviceName:   '$service.serviceName',
        bookingCount:  { $ifNull: ['$bookingSummary.bookingCount', 0] },
        totalFreight:  { $ifNull: ['$bookingSummary.totalFreight', 0] },
        totalQty:      { $ifNull: ['$bookingSummary.totalQty',     0] },
      },
    },
    { $sort: { etd: 1, sequence: 1 } },
  ]);

  // slotCount removed in Sprint 017 — totals no longer include it
  const totals = rows.reduce((acc, r) => ({
    bookingCount: acc.bookingCount + r.bookingCount,
    totalFreight: acc.totalFreight + r.totalFreight,
    totalQty:     acc.totalQty     + r.totalQty,
  }), { bookingCount: 0, totalFreight: 0, totalQty: 0 });

  return { rows, totals };
};

// ─────────────────────────────────────────────────────────────────────────────
// Report 3 — Booking Report
// ─────────────────────────────────────────────────────────────────────────────
const getBookingReport = async ({ voyageId, agentId, status, dateFrom, dateTo, serviceId, page = 1, limit = 50 } = {}) => {
  const match = { isDeleted: false };
  if (voyageId) match.voyageId = toObjId(voyageId);
  if (agentId)  match.agentId  = toObjId(agentId);
  if (status)   match.status   = status;
  const dr = dateRange(dateFrom, dateTo);
  if (dr) match.createdAt = dr;

  if (serviceId) {
    const vids = await Voyage.find({ serviceId: toObjId(serviceId) }).distinct('_id');
    match.voyageId = { $in: vids };
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [rows, total] = await Promise.all([
    Booking.find(match)
      .populate('voyageId',        'voyageNumber')
      .populate('agentId',         'agentCode agentName')
      .populate('polId',           'name code')
      .populate('podId',           'name code')
      .populate('containerTypeId', 'code size type')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))
      .lean(),
    Booking.countDocuments(match),
  ]);

  // slotCount removed Sprint 017
  const summaryAgg = await Booking.aggregate([
    { $match: { ...match, status: { $ne: 'Cancelled' } } },
    { $group: {
        _id:          null,
        totalFreight: { $sum: '$totalFreight' },
        totalQty:     { $sum: '$quantity' },
        count:        { $sum: 1 },
    }},
  ]);
  const summary = summaryAgg[0] || { totalFreight: 0, totalQty: 0, count: 0 };

  return { rows, total, summary };
};

// ─────────────────────────────────────────────────────────────────────────────
// Report 4 — Revenue Report
// ─────────────────────────────────────────────────────────────────────────────
const getRevenueReport = async ({ serviceId, dateFrom, dateTo } = {}) => {
  const voyageMatch = {};
  if (serviceId) voyageMatch.serviceId = toObjId(serviceId);
  const dr = dateRange(dateFrom, dateTo);
  if (dr) voyageMatch.etd = dr;

  const rows = await Voyage.aggregate([
    { $match: voyageMatch },
    {
      $lookup: {
        from:     'bookings',
        let:      { vid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ['$voyageId', '$$vid'] },
            { $eq: ['$isDeleted', false] },
            { $ne:  ['$status', 'Cancelled'] },
          ]}}},
          { $group: {
              _id:          null,
              totalFreight: { $sum: '$totalFreight' },
              bookingCount: { $sum: 1 },
              totalQty:     { $sum: '$quantity' },
          }},
        ],
        as: 'bk',
      },
    },
    // FIX: was preserveNullAndEmpty (invalid) → preserveNullAndEmptyArrays
    { $unwind: { path: '$bk',  preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'services', localField: 'serviceId', foreignField: '_id', as: 'svc' } },
    // FIX: was preserveNullAndEmpty (invalid) → preserveNullAndEmptyArrays
    { $unwind: { path: '$svc', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id:          '$serviceId',
        serviceCode:  { $first: '$svc.serviceCode' },
        serviceName:  { $first: '$svc.serviceName' },
        voyageCount:  { $sum: 1 },
        bookingCount: { $sum: { $ifNull: ['$bk.bookingCount', 0] } },
        totalRevenue: { $sum: { $ifNull: ['$bk.totalFreight', 0] } },
        totalQty:     { $sum: { $ifNull: ['$bk.totalQty',     0] } },
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);

  const grandTotal = rows.reduce((acc, r) => ({
    voyageCount:  acc.voyageCount  + r.voyageCount,
    bookingCount: acc.bookingCount + r.bookingCount,
    totalRevenue: acc.totalRevenue + r.totalRevenue,
    totalQty:     acc.totalQty     + r.totalQty,
  }), { voyageCount: 0, bookingCount: 0, totalRevenue: 0, totalQty: 0 });

  return { rows, grandTotal };
};

const getExpenseReport = async ({ category, expenseTypeId, roundId, voyageId, dateFrom, dateTo, currency } = {}) => {
  const match = {};
  if (roundId)       match.roundId       = toObjId(roundId);
  if (voyageId)      match.voyageId      = toObjId(voyageId);
  if (expenseTypeId) match.expenseTypeId = toObjId(expenseTypeId);
  if (currency)      match.currency      = currency.toUpperCase();
  const dr = dateRange(dateFrom, dateTo);
  if (dr) match.expenseDate = dr;

  const rows = await Expense.find(match)
    .populate('expenseTypeId', 'name category')
    .populate('roundId',       'roundNumber')
    .populate('voyageId',      'voyageNumber')
    .populate('agentId',       'agentCode agentName')
    .sort({ expenseDate: -1 })
    .lean();

  const filtered = category ? rows.filter(e => e.expenseTypeId?.category === category) : rows;

  const summaryMap = {};
  filtered.forEach(e => {
    const cat = e.expenseTypeId?.category || 'Uncategorised';
    const cur = e.currency || 'USD';
    const key = `${cat}__${cur}`;
    if (!summaryMap[key]) summaryMap[key] = { category: cat, currency: cur, total: 0, count: 0 };
    summaryMap[key].total += e.amount || 0;
    summaryMap[key].count += 1;
  });

  const summary = Object.values(summaryMap).sort((a, b) => a.category.localeCompare(b.category));
  return { rows: filtered, summary };
};

// ─────────────────────────────────────────────────────────────────────────────
// Report 6 — Round Capacity (Sprint 022)
// ─────────────────────────────────────────────────────────────────────────────
const getRoundCapacityReport = async ({ roundId, statuses } = {}) => {
  if (!roundId) throw { status: 400, message: 'roundId is required' };
  const { computeRoundCapacity } = require('../capacity/capacity.service');
  const opts = {};
  if (statuses) opts.statuses = statuses.split(',').map(s => s.trim()).filter(Boolean);
  return computeRoundCapacity(roundId, opts);
};

module.exports = { getRoundPnL, getVoyagePerformance, getBookingReport, getRevenueReport, getExpenseReport, getRoundCapacityReport };
