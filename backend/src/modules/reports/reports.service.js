'use strict';

const mongoose   = require('mongoose');
const Round      = require('../rounds/round.model');
const Voyage     = require('../voyages/voyage.model');
const Booking    = require('../bookings/booking.model');
const ManualBooking = require('../bookings/manualBooking.model');
const Expense    = require('../expenses/expense.model');
const Service    = require('../services/service.model');
const { resolveTEU } = require('../../utils/teuResolver');
const expenseTypeService = require('../expenseTypes/expenseType.service');
const { BOOKING_STATUS } = require('../../config/constants');

// ─── helpers ──────────────────────────────────────────────────────────────────
const toObjId = (id) => new mongoose.Types.ObjectId(String(id));
const dateRange = (from, to) => {
  const q = {};
  if (from) q.$gte = new Date(from);
  if (to)   q.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  return Object.keys(q).length ? q : null;
};

// Sprint 034 Task 2 — Booking Revenue Details' own size-bucket
// classification. This is a DIFFERENT question from teuResolver.js#
// resolveTEU() (a TEU-value concept, unmodified, reused as-is for the
// TEUs column) — this answers "does this booking belong in the 20
// column or the 40 column" for this report specifically. Per Decision 10
// (approved): 20 Qty = 20ft only; 40 Qty = 40ft, 40HC, 44ft, 45ft.
const classifyRevenueSizeBucket = (size) => {
  if (!size || typeof size !== 'string') return null;
  const norm = size.trim().toUpperCase().replace(/\s+/g, '');
  const m = norm.match(/^(\d{2,3})/);
  if (!m) return null;
  const len = Number(m[1]);
  if (len === 20) return '20';
  if (len === 40 || len === 44 || len === 45) return '40';
  return null;
};

// Sprint 035 — voyage duration for Hire Rate cost (rate x duration).
// Business Question 1 (planned-vs-actual formula) is still open; the actual
// dates (ata/atd) are used when both are present since they are the more
// accurate figure once known, falling back to the planned dates (eta/etd)
// otherwise. Returns whole/fractional days, 0 if neither pair is available.
const voyageDurationDays = (voyage) => {
  const start = voyage.atd || voyage.etd;
  const end   = voyage.ata || voyage.eta;
  if (!start || !end) return 0;
  const ms = new Date(end) - new Date(start);
  return ms > 0 ? ms / (1000 * 60 * 60 * 24) : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Report 1 — Round P&L  →  evolved (Sprint 035) into the Voyage Profitability
// Report. Same function/route/endpoint — extended in place per ADR-1.
//
// voyageId (optional): narrows the report to a single voyage ("voyage scope").
// Omitted: reports on every voyage in the round ("round scope").
//
// ADR-4: voyage set is always resolved via Voyage.find({roundId}) — never the
// denormalized, unverified Round.voyageIds array.
// ADR-2: Revenue is Layer 2 ONLY, Final Loading status ONLY (deliberately
// different population from the combined L1+L2 "all non-Cancelled" revenue
// this function already reported pre-Sprint-035 — that figure is kept below,
// unchanged, for backward compatibility, as totalRevenue/l1Revenue/l2Revenue).
// Business rule (Sprint 035 directive): Voyage Cost vs Other Voyage Cost is
// NEVER decided by a hardcoded category name — always via
// expenseTypeService.getCostClassificationMap(), which reads the
// business-configured ExpenseCategory.costClassification field.
// Structural rule: Voyage Cost is broken out PER VOYAGE even in round scope;
// Other Voyage Cost is aggregated by SCOPE ONLY (one round-wide or one
// voyage-wide total) — never per-voyage within round scope.
// ADR-6: Hire Rate expenses (ExpenseType.name === 'Hire Rate') don't
// contribute their raw `amount` — their cost is rate x voyage duration,
// computed per voyage, summed into the one scope-wide Other Voyage Cost
// total (Hire Rate is a normal cost item, not "Voyage Cost" by definition,
// since it is not a per-port cost).
// ADR-7: bunkerCost is a reserved, always-null, always-excluded placeholder.
// ─────────────────────────────────────────────────────────────────────────────
const getRoundPnL = async ({ roundId, voyageId } = {}) => {
  if (!roundId) throw { status: 400, message: 'roundId is required' };

  const round = await Round.findOne({ _id: roundId, isDeleted: false })
    .populate('serviceId', 'serviceCode serviceName')
    .populate('vesselId',  'vesselCode vesselName')
    .lean();
  if (!round) throw { status: 404, message: 'Round not found' };

  // ADR-4 — always resolve the round's voyages directly, never Round.voyageIds.
  const roundVoyages = await Voyage.find({ roundId: toObjId(roundId) })
    .populate('polId', 'name')
    .populate('podId', 'name')
    .lean();

  if (voyageId && !roundVoyages.some(v => String(v._id) === String(voyageId))) {
    throw { status: 400, message: 'voyageId does not belong to this round' };
  }

  const scope = voyageId ? 'voyage' : 'round';
  const scopedVoyages = voyageId ? roundVoyages.filter(v => String(v._id) === String(voyageId)) : roundVoyages;
  const voyageIds = roundVoyages.map(v => v._id); // pre-existing legacy fields below stay round-wide, unchanged
  const scopedVoyageIds = scopedVoyages.map(v => v._id);

  // ── Legacy fields — unchanged behaviour, kept for backward compatibility ──
  const revenueAgg = await Booking.aggregate([
    { $match: { voyageId: { $in: voyageIds }, isDeleted: false, status: { $ne: 'Cancelled' } } },
    { $group: {
        _id:          null,
        totalRevenue: { $sum: '$totalFreight' },
        bookingCount: { $sum: 1 },
        totalQty:     { $sum: '$quantity' },
    }},
  ]);

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

  // ── Sprint 035 — Voyage Profitability additions ───────────────────────────

  // Revenue per voyage — Layer 2, Final Loading ONLY (ADR-2).
  const revenueBookings = await Booking.find({
    voyageId: { $in: scopedVoyageIds }, status: 'Final Loading', isDeleted: false,
  }).populate('containerTypeId', 'size').lean();

  const revenueByVoyage = new Map();
  revenueBookings.forEach(b => {
    const key = String(b.voyageId);
    if (!revenueByVoyage.has(key)) revenueByVoyage.set(key, { totalRevenue: 0, teus: 0, vgm: 0, bookingCount: 0 });
    const r = revenueByVoyage.get(key);
    r.totalRevenue += b.totalFreight || 0;
    r.teus         += resolveTEU(b.containerTypeId?.size).teu;
    // Sprint 036 Decision 1 — VGM (MT) is mandatory on Revenue by Voyage.
    // Booking.vgm is stored in kg (booking.model.js field comment); this
    // report's unit is MT, so the raw sum is converted once, here.
    r.vgm          += (b.vgm || 0) / 1000;
    r.bookingCount += 1;
  });

  // Classification map — the ONLY sanctioned source of Voyage Cost vs Other
  // Voyage Cost. Never a hardcoded category-name comparison.
  const classificationMap = await expenseTypeService.getCostClassificationMap();
  const classifyExpense = (e) => {
    const cat = (e.expenseTypeId?.category || '').trim().toUpperCase();
    return classificationMap[cat] || 'Other Voyage Cost';
  };

  const scopeExpenses = await Expense.find({
    $or: [
      { roundId: toObjId(roundId), voyageId: null },
      { voyageId: { $in: scopedVoyageIds } },
    ],
  }).populate('expenseTypeId', 'name category').populate('portId', 'name code').lean();

  // Voyage Cost — broken out PER VOYAGE, even in round scope.
  // Sprint 036 — byPort keys on the real portId (Expense.portId, a
  // reference to that voyage's own POL/POD — never a free-text match)
  // when present, falling back to the legacy free-text `port` string
  // for older records that predate Port scope.
  const voyageCostByVoyage = new Map(); // voyageId -> { total, byPort: Map(key -> {portId, portName, total}) }
  const roundLevelVoyageCostMap = new Map(); // expenseTypeId -> { expenseTypeName, category, total, count } — round-linked, no voyageId

  // Other Voyage Cost — SCOPE-WIDE ONLY (one total, never per voyage).
  let otherExpenseCost = 0;
  let hireRateCost = 0;
  const otherBreakdownMap = new Map(); // category -> { category, total, count }

  const durationByVoyageId = new Map(scopedVoyages.map(v => [String(v._id), voyageDurationDays(v)]));

  scopeExpenses.forEach(e => {
    const classification = classifyExpense(e);
    const isHireRate = (e.expenseTypeId?.name || '').trim().toUpperCase() === 'HIRE RATE';

    if (classification === 'Voyage Cost') {
      if (!e.voyageId) {
        // Round-linked, not voyage-specific — cannot be broken out per voyage.
        const tKey = String(e.expenseTypeId?._id || 'uncategorised');
        if (!roundLevelVoyageCostMap.has(tKey)) {
          roundLevelVoyageCostMap.set(tKey, {
            expenseTypeName: e.expenseTypeId?.name || 'Uncategorised',
            category:        e.expenseTypeId?.category || 'Uncategorised',
            total: 0, count: 0,
          });
        }
        const b = roundLevelVoyageCostMap.get(tKey);
        b.total += e.amount || 0;
        b.count += 1;
        return;
      }
      const vKey = String(e.voyageId);
      if (!voyageCostByVoyage.has(vKey)) voyageCostByVoyage.set(vKey, { total: 0, byPort: new Map() });
      const vc = voyageCostByVoyage.get(vKey);
      vc.total += e.amount || 0;
      const portKey  = e.portId?._id ? String(e.portId._id) : (e.port || 'Unspecified');
      const existing = vc.byPort.get(portKey);
      vc.byPort.set(portKey, {
        portId:   e.portId?._id || null,
        portName: e.portId?.name || e.port || 'Unspecified',
        total:    (existing?.total || 0) + (e.amount || 0),
      });
      return;
    }

    // Other Voyage Cost — Hire Rate is rate x duration, not the raw amount.
    if (isHireRate && e.voyageId) {
      const days = durationByVoyageId.get(String(e.voyageId)) || 0;
      hireRateCost += (e.amount || 0) * days;
    } else {
      otherExpenseCost += e.amount || 0;
    }
    const cat = e.expenseTypeId?.category || 'Uncategorised';
    if (!otherBreakdownMap.has(cat)) otherBreakdownMap.set(cat, { category: cat, total: 0, count: 0 });
    const ob = otherBreakdownMap.get(cat);
    ob.total += isHireRate && e.voyageId ? (e.amount || 0) * (durationByVoyageId.get(String(e.voyageId)) || 0) : (e.amount || 0);
    ob.count += 1;
  });

  const voyages = scopedVoyages.map(v => {
    const r  = revenueByVoyage.get(String(v._id))  || { totalRevenue: 0, teus: 0, vgm: 0, bookingCount: 0 };
    const vc = voyageCostByVoyage.get(String(v._id)) || { total: 0, byPort: new Map() };
    const polName = v.polId?.name || '';
    const podName = v.podId?.name || '';
    return {
      voyageId:     v._id,
      voyageNumber: v.voyageNumber,
      voyageName:   v.voyageName || null,
      polName,
      podName,
      etd: v.etd, eta: v.eta, atd: v.atd, ata: v.ata,
      durationDays: durationByVoyageId.get(String(v._id)) || 0,
      // Sprint 036 Decision 1 — POL/POD/VGM mirrored inside revenue{}
      // itself so the Revenue-by-Voyage row is self-contained.
      revenue: {
        totalRevenue: r.totalRevenue, teus: r.teus, vgm: r.vgm, bookingCount: r.bookingCount,
        polName, podName,
      },
      voyageCost: {
        total:  vc.total,
        byPort: [...vc.byPort.values()],
      },
    };
  });

  const roundLevelVoyageCost = [...roundLevelVoyageCostMap.values()];
  const otherVoyageCostTotal = otherExpenseCost + hireRateCost;

  const totalVoyageProfitRevenue = voyages.reduce((s, v) => s + v.revenue.totalRevenue, 0);
  const totalTEU = voyages.reduce((s, v) => s + v.revenue.teus, 0);
  const totalVoyageCost = voyages.reduce((s, v) => s + v.voyageCost.total, 0)
    + roundLevelVoyageCost.reduce((s, r) => s + r.total, 0);

  // ADR-7 — bunkerCost is a reserved, always-null placeholder, excluded from
  // every calculation below.
  const bunkerCost = null;
  const netProfit = totalVoyageProfitRevenue - totalVoyageCost - otherVoyageCostTotal;

  const summary = {
    totalRevenue:      totalVoyageProfitRevenue,
    totalVoyageCost,
    totalOtherVoyageCost: otherVoyageCostTotal,
    bunkerCost,
    netProfit,
    totalTEU,
    profitPerTEU:     totalTEU > 0 ? netProfit / totalTEU : 0,
    profitMarginPct:  totalVoyageProfitRevenue > 0 ? (netProfit / totalVoyageProfitRevenue) * 100 : 0,
  };

  return {
    round: {
      _id:         round._id,
      roundNumber: round.roundNumber,
      roundName:   round.roundName || null,
      status:      round.status,
      startDate:   round.startDate,
      endDate:     round.endDate,
      service:     round.serviceId,
      vessel:      round.vesselId,
    },
    voyageCount:   voyageIds.length,
    // Layer 2 (operational) counts — legacy, round-wide, unchanged
    bookingCount:  rev.bookingCount,
    totalQuantity: rev.totalQty,
    // Layer 1 (manual / commercial) — legacy, round-wide, unchanged
    manualBookingCount:    l1.count,
    manualTotalUnits:      l1.totalUnits,
    // Combined revenue (L1 + L2), all non-Cancelled — legacy, round-wide, unchanged
    totalRevenue:  rev.totalRevenue + l1.totalRevenue,
    l2Revenue:     rev.totalRevenue,
    l1Revenue:     l1.totalRevenue,
    expenseTotals,
    expenseBreakdown,

    // Sprint 035 — Voyage Profitability Report
    scope,
    voyages,
    roundLevelVoyageCost,
    otherVoyageCost: {
      total:            otherVoyageCostTotal,
      hireRateCost,
      otherExpenseCost,
      breakdown: [...otherBreakdownMap.values()],
    },
    bunkerCost,
    summary,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Report 2 — Voyage Performance
// Sprint 038 — dual-layer support (Booking Source: L1/L2/Combined) and a
// Booking Status filter (All / Final Loading), reusing the exact
// fetch-then-merge-in-JS shape getBookingReport (Sprint 034) already
// proved, so Layer 1 (ManualBooking) and Layer 2 (Booking) are always
// aggregated the same way every other dual-layer report in this codebase
// already does — no new merge pattern invented.
// The dead `$sum:'$quantity'` field (Booking.quantity was removed from
// the schema in Sprint 025/026) is removed entirely; the replacement
// "units" figure is source-aware: Layer 2 contributes its booking count
// (one booking = one container, same rule capacity.service.js already
// uses), Layer 1 contributes its own real totalUnits sum — combined when
// bookingSource === 'combined', mirroring
// capacity.service.js#computeRoundCapacity's own totalBookedUnits rule.
// ─────────────────────────────────────────────────────────────────────────────
const getVoyagePerformance = async ({
  voyageId, serviceId, roundId, status, dateFrom, dateTo,
  bookingSource = 'combined', bookingStatus = 'all',
} = {}) => {
  if (!['L1', 'L2', 'combined'].includes(bookingSource)) {
    throw { status: 400, message: "bookingSource must be one of: L1, L2, combined" };
  }
  // bookingStatus accepts 'all' or any real BOOKING_STATUS value (Pending,
  // Confirmed, Final Loading, Cancelled) — not just a binary
  // all/finalLoading choice, so a user can isolate any single status.
  if (bookingStatus !== 'all' && !BOOKING_STATUS.includes(bookingStatus)) {
    throw { status: 400, message: `bookingStatus must be one of: all, ${BOOKING_STATUS.join(', ')}` };
  }

  const match = {};
  if (voyageId)  match._id       = toObjId(voyageId);
  if (serviceId) match.serviceId = toObjId(serviceId);
  if (roundId)   match.roundId   = toObjId(roundId);
  if (status)    match.status    = status;
  const dr = dateRange(dateFrom, dateTo);
  if (dr) match.etd = dr;

  const voyages = await Voyage.find(match)
    .populate('roundId',   'roundNumber roundName')
    .populate('serviceId', 'serviceCode serviceName')
    .populate('polId',     'name')
    .populate('podId',     'name')
    .sort({ etd: 1, sequence: 1 })
    .lean();
  const voyageIds = voyages.map(v => v._id);

  const statusMatch = bookingStatus === 'all'
    ? { status: { $ne: 'Cancelled' } }
    : { status: bookingStatus };

  const [l2Agg, l1Agg] = await Promise.all([
    bookingSource !== 'L1'
      ? Booking.aggregate([
          { $match: { voyageId: { $in: voyageIds }, isDeleted: false, ...statusMatch } },
          { $group: { _id: '$voyageId', bookingCount: { $sum: 1 }, totalFreight: { $sum: '$totalFreight' } } },
        ])
      : Promise.resolve([]),
    bookingSource !== 'L2'
      ? ManualBooking.aggregate([
          { $match: { voyageId: { $in: voyageIds }, isDeleted: false, ...statusMatch } },
          { $group: { _id: '$voyageId', bookingCount: { $sum: 1 }, totalFreight: { $sum: '$totalFreight' }, totalUnits: { $sum: '$totalUnits' } } },
        ])
      : Promise.resolve([]),
  ]);

  const l2ByVoyage = new Map(l2Agg.map(a => [String(a._id), a]));
  const l1ByVoyage = new Map(l1Agg.map(a => [String(a._id), a]));

  const rows = voyages.map(v => {
    const l2 = l2ByVoyage.get(String(v._id)) || { bookingCount: 0, totalFreight: 0 };
    const l1 = l1ByVoyage.get(String(v._id)) || { bookingCount: 0, totalFreight: 0, totalUnits: 0 };
    return {
      _id: v._id,
      voyageNumber: v.voyageNumber, status: v.status, etd: v.etd, eta: v.eta, sequence: v.sequence,
      voyageName:   v.voyageName || null,
      polName:      v.polId?.name || '',
      podName:      v.podId?.name || '',
      roundNumber:  v.roundId?.roundNumber || '',
      roundName:    v.roundId?.roundName || null,
      serviceCode:  v.serviceId?.serviceCode || '',
      serviceName:  v.serviceId?.serviceName || '',
      bookingCount: l2.bookingCount + l1.bookingCount,
      totalFreight: l2.totalFreight + l1.totalFreight,
      totalUnits:   l2.bookingCount + l1.totalUnits,
      layer1: { bookingCount: l1.bookingCount, totalFreight: l1.totalFreight, totalUnits: l1.totalUnits },
      layer2: { bookingCount: l2.bookingCount, totalFreight: l2.totalFreight },
    };
  });

  const totals = rows.reduce((acc, r) => ({
    bookingCount: acc.bookingCount + r.bookingCount,
    totalFreight: acc.totalFreight + r.totalFreight,
    totalUnits:   acc.totalUnits   + r.totalUnits,
  }), { bookingCount: 0, totalFreight: 0, totalUnits: 0 });

  return { rows, totals };
};

// ─────────────────────────────────────────────────────────────────────────────
// Report 3 — Booking Report
// Sprint 034 Task 1: migrated to the current dual-layer architecture.
// Combines Layer 1 (ManualBooking) + Layer 2 (Booking), same merge-in-JS
// shape already proven in vessel.service.js#getVesselStats (Sprint 032).
// Legacy `quantity`/`totalSlots` fields (removed from the schema in
// Sprint 017/025/026) are gone — see sprints/034-sprint.txt Decisions 4/5.
// ─────────────────────────────────────────────────────────────────────────────
const getBookingReport = async ({ voyageId, agentId, status, dateFrom, dateTo, serviceId, page = 1, limit = 50 } = {}) => {
  let voyageFilterIds = null;
  if (serviceId) {
    voyageFilterIds = await Voyage.find({ serviceId: toObjId(serviceId) }).distinct('_id');
  }

  // Sprint 034 Decision 3: rows and summary now apply the IDENTICAL
  // status/Cancelled rule — Cancelled is excluded by default and only
  // included when the user explicitly filters for it. buildMatch()'s
  // logic is the single source of truth for both the row queries and
  // the summary aggregates below, so the two can never disagree again.
  const buildMatch = () => {
    const match = { isDeleted: false };
    if (voyageFilterIds) match.voyageId = { $in: voyageFilterIds };
    else if (voyageId)   match.voyageId = toObjId(voyageId);
    if (agentId) match.agentId = toObjId(agentId);
    match.status = status || { $ne: 'Cancelled' };
    const dr = dateRange(dateFrom, dateTo);
    if (dr) match.createdAt = dr;
    return match;
  };

  const l2Match = buildMatch();
  const l1Match = buildMatch();

  const [l2Docs, l1Docs] = await Promise.all([
    Booking.find(l2Match)
      .populate('voyageId',        'voyageNumber voyageName')
      .populate('agentId',         'agentCode agentName')
      .populate('containerTypeId', 'code size type')
      .sort({ createdAt: -1 })
      .lean(),
    ManualBooking.find(l1Match)
      .populate('voyageId', 'voyageNumber voyageName')
      .populate('agentId',  'agentCode agentName')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  // Merge, tag by layer, sort combined set by createdAt desc, then paginate
  // in JS — a single MongoDB sort can no longer span two collections.
  const merged = [
    ...l2Docs.map(b => ({
      _id: b._id, layer: 'Operational', bookingNumber: b.bookingNumber,
      voyageId: b.voyageId, agentId: b.agentId,
      shipper: b.shipper, consignee: b.consignee,
      containerNumber: b.containerNumber,
      totalFreight: b.totalFreight, status: b.status, createdAt: b.createdAt,
    })),
    ...l1Docs.map(b => ({
      _id: b._id, layer: 'Manual', bookingNumber: b.bookingNumber,
      voyageId: b.voyageId, agentId: b.agentId,
      shipper: null, consignee: null,
      containerNumber: null,
      totalFreight: b.totalFreight, status: b.status, createdAt: b.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = merged.length;
  const skip  = (Number(page) - 1) * Number(limit);
  const rows  = merged.slice(skip, skip + Number(limit));

  // Sprint 034 Decision 4: Layer 2 has no unit-count concept since
  // Sprint 025 ("one booking = one container") — "Total Units" reflects
  // Layer 1's real totalUnits sum only. Sprint 034 Decision 5: "Total
  // Slots" is removed entirely (no backing field since Sprint 017).
  const [l2SummaryAgg, l1SummaryAgg] = await Promise.all([
    Booking.aggregate([
      { $match: l2Match },
      { $group: { _id: null, totalFreight: { $sum: '$totalFreight' }, count: { $sum: 1 } } },
    ]),
    ManualBooking.aggregate([
      { $match: l1Match },
      { $group: { _id: null, totalFreight: { $sum: '$totalFreight' }, totalUnits: { $sum: '$totalUnits' }, count: { $sum: 1 } } },
    ]),
  ]);
  const l2Summary = l2SummaryAgg[0] || { totalFreight: 0, count: 0 };
  const l1Summary = l1SummaryAgg[0] || { totalFreight: 0, totalUnits: 0, count: 0 };

  const summary = {
    count:        l2Summary.count + l1Summary.count,
    totalFreight: l2Summary.totalFreight + l1Summary.totalFreight,
    totalUnits:   l1Summary.totalUnits,
  };

  return { rows, total, summary };
};

// ─────────────────────────────────────────────────────────────────────────────
// Report 4 — Revenue Report
// Sprint 038 (final business decision, no longer an open question):
// Revenue Report represents OPERATIONAL REVENUE — Layer 2 ONLY, status
// = Final Loading ONLY. Pending and Confirmed bookings are
// INTENTIONALLY EXCLUDED — this is not a filter the user can relax, it
// is what "Revenue" means system-wide as of Sprint 033 (Invoice
// eligibility)/034 (Booking Revenue Details)/035-036 (Voyage
// Profitability), all independently confirming the same population.
// The dead `$sum:'$quantity'` field (Booking.quantity does not exist —
// removed Sprint 025/026) is removed entirely; `bookingCount` (already
// computed) already fully answers "how many containers," so no
// replacement units field is added, matching Sprint 034's precedent of
// removing "Total Slots" outright rather than keeping a duplicate
// concept under a new name.
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
            { $eq:  ['$status', 'Final Loading'] },
          ]}}},
          { $group: {
              _id:          null,
              totalFreight: { $sum: '$totalFreight' },
              bookingCount: { $sum: 1 },
          }},
        ],
        as: 'bk',
      },
    },
    { $unwind: { path: '$bk',  preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'services', localField: 'serviceId', foreignField: '_id', as: 'svc' } },
    { $unwind: { path: '$svc', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id:          '$serviceId',
        serviceCode:  { $first: '$svc.serviceCode' },
        serviceName:  { $first: '$svc.serviceName' },
        voyageCount:  { $sum: 1 },
        bookingCount: { $sum: { $ifNull: ['$bk.bookingCount', 0] } },
        totalRevenue: { $sum: { $ifNull: ['$bk.totalFreight', 0] } },
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);

  const grandTotal = rows.reduce((acc, r) => ({
    voyageCount:  acc.voyageCount  + r.voyageCount,
    bookingCount: acc.bookingCount + r.bookingCount,
    totalRevenue: acc.totalRevenue + r.totalRevenue,
  }), { voyageCount: 0, bookingCount: 0, totalRevenue: 0 });

  return { rows, grandTotal };
};

// Sprint 038 — brought to Sprint 036 parity: portId filter/populate,
// computed `scope` per row (reusing expense.service.js#deriveScope
// directly — never re-deriving the same rule a second time, per ADR-4),
// and a second summary dimension grouped by the exact same
// costClassification map getRoundPnL already builds, so this report's
// Voyage Cost/Other Voyage Cost totals are guaranteed to reconcile with
// Voyage Profitability's for the same round.
const getExpenseReport = async ({ category, expenseTypeId, roundId, voyageId, portId, dateFrom, dateTo, currency } = {}) => {
  const { deriveScope } = require('../expenses/expense.service');

  const match = {};
  if (roundId)       match.roundId       = toObjId(roundId);
  if (voyageId)      match.voyageId      = toObjId(voyageId);
  if (portId)        match.portId        = toObjId(portId);
  if (expenseTypeId) match.expenseTypeId = toObjId(expenseTypeId);
  if (currency)      match.currency      = currency.toUpperCase();
  const dr = dateRange(dateFrom, dateTo);
  if (dr) match.expenseDate = dr;

  const rows = await Expense.find(match)
    .populate('expenseTypeId', 'name category')
    .populate('roundId',       'roundNumber roundName')
    .populate('voyageId',      'voyageNumber voyageName')
    .populate('agentId',       'agentCode agentName')
    .populate('portId',        'name code')
    .sort({ expenseDate: -1 })
    .lean();

  const filtered = (category ? rows.filter(e => e.expenseTypeId?.category === category) : rows)
    .map(e => ({ ...e, scope: deriveScope(e) }));

  const summaryMap = {};
  const classificationMap = await expenseTypeService.getCostClassificationMap();
  const classificationSummaryMap = {};
  filtered.forEach(e => {
    const cat = e.expenseTypeId?.category || 'Uncategorised';
    const cur = e.currency || 'USD';
    const key = `${cat}__${cur}`;
    if (!summaryMap[key]) summaryMap[key] = { category: cat, currency: cur, total: 0, count: 0 };
    summaryMap[key].total += e.amount || 0;
    summaryMap[key].count += 1;

    const classification = classificationMap[cat.trim().toUpperCase()] || 'Other Voyage Cost';
    const cKey = `${classification}__${cur}`;
    if (!classificationSummaryMap[cKey]) {
      classificationSummaryMap[cKey] = { classification, currency: cur, total: 0, count: 0 };
    }
    classificationSummaryMap[cKey].total += e.amount || 0;
    classificationSummaryMap[cKey].count += 1;
  });

  const summary = Object.values(summaryMap).sort((a, b) => a.category.localeCompare(b.category));
  const classificationSummary = Object.values(classificationSummaryMap)
    .sort((a, b) => a.classification.localeCompare(b.classification));

  return { rows: filtered, summary, classificationSummary };
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

// ─────────────────────────────────────────────────────────────────────────────
// Report 7 — Booking Revenue Details (Sprint 034 Task 2)
// Layer 2, Final Loading ONLY — no ManualBooking, Invoice, or Payment
// (Decision 6). Each row is one commercial PRICING GROUP, uniquely
// identified by Agent + Commodity + POL + POD + Container Type +
// Freight Rate (Decision 9). Bookings in different pricing groups are
// never merged — Rate 20/Rate 40 are always the real, shared rate of
// the grouped bookings, never an average.
// ─────────────────────────────────────────────────────────────────────────────
const getBookingRevenueDetails = async ({ agentId, voyageId, roundId, dateFrom, dateTo } = {}) => {
  const match = { status: 'Final Loading', isDeleted: false };
  if (agentId) match.agentId = toObjId(agentId);
  if (voyageId) {
    match.voyageId = toObjId(voyageId);
  } else if (roundId) {
    const vids = await Voyage.find({ roundId: toObjId(roundId) }).distinct('_id');
    match.voyageId = { $in: vids };
  }
  const dr = dateRange(dateFrom, dateTo);
  if (dr) match.createdAt = dr;

  const bookings = await Booking.find(match)
    .populate('agentId', 'agentCode agentName')
    .populate('polId', 'name')
    .populate('podId', 'name')
    .populate('containerTypeId', 'code size type')
    .lean();

  // Group in JS on the six-part pricing-group key (Grouping Strategy) —
  // not a Mongo-side aggregation, so teuResolver.js#resolveTEU() can be
  // called directly and unmodified.
  const groups = new Map();
  bookings.forEach(b => {
    const size   = b.containerTypeId?.size || null;
    const bucket = classifyRevenueSizeBucket(size);
    const normalizedCommodity = (b.commodity || '').trim().toUpperCase();

    const key = [
      String(b.agentId?._id || b.agentId || ''),
      normalizedCommodity,
      String(b.polId?._id || b.polId || ''),
      String(b.podId?._id || b.podId || ''),
      String(b.containerTypeId?._id || b.containerTypeId || ''),
      String(b.freightRate),
    ].join('__');

    if (!groups.has(key)) {
      groups.set(key, {
        agentId:           b.agentId?._id || null,
        agentName:         b.agentId?.agentName || '',
        commodity:         b.commodity || 'Uncategorised',
        polName:           b.polId?.name || '',
        podName:           b.podId?.name || '',
        containerTypeId:   b.containerTypeId?._id || null,
        containerTypeCode: b.containerTypeId?.code || '',
        freightRate:       b.freightRate,
        bucket,
        count: 0,
        teus:  0,
        vgm:   0,
      });
    }

    const g = groups.get(key);
    g.count += 1;
    g.teus  += resolveTEU(size).teu;
    // Sprint 038 (Cross Report Consistency) — Booking.vgm is stored in
    // kg; converted to MT here so this report's VGM figure agrees with
    // getRoundPnL's (Sprint 036), which already made this same
    // conversion. Same unit, same source field, now one rule.
    g.vgm   += (b.vgm || 0) / 1000;
  });

  const rows = [...groups.values()].map(g => {
    const qty20  = g.bucket === '20' ? g.count : 0;
    const qty40  = g.bucket === '40' ? g.count : 0;
    const rate20 = g.bucket === '20' ? g.freightRate : 0;
    const rate40 = g.bucket === '40' ? g.freightRate : 0;
    const revenue20 = qty20 * rate20;
    const revenue40 = qty40 * rate40;
    return {
      agentId:           g.agentId,
      agentName:         g.agentName,
      commodity:         g.commodity,
      polName:           g.polName,
      podName:           g.podName,
      containerTypeId:   g.containerTypeId,
      containerTypeCode: g.containerTypeCode,
      qty20, qty40,
      teus: g.teus,
      vgm:  g.vgm,
      rate20, rate40,
      revenue20, revenue40,
      totalRevenue: revenue20 + revenue40,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const grandTotal = rows.reduce((acc, r) => ({
    qty20:        acc.qty20        + r.qty20,
    qty40:        acc.qty40        + r.qty40,
    teus:         acc.teus         + r.teus,
    vgm:          acc.vgm          + r.vgm,
    revenue20:    acc.revenue20    + r.revenue20,
    revenue40:    acc.revenue40    + r.revenue40,
    totalRevenue: acc.totalRevenue + r.totalRevenue,
  }), { qty20: 0, qty40: 0, teus: 0, vgm: 0, revenue20: 0, revenue40: 0, totalRevenue: 0 });

  return { rows, grandTotal };
};

module.exports = {
  getRoundPnL, getVoyagePerformance, getBookingReport, getRevenueReport,
  getExpenseReport, getRoundCapacityReport, getBookingRevenueDetails,
};
