'use strict';

const Round         = require('../rounds/round.model');
const Voyage        = require('../voyages/voyage.model');
const Booking       = require('../bookings/booking.model');
const ManualBooking = require('../bookings/manualBooking.model');
const Vessel        = require('../vessels/vessel.model');
const cache         = require('../../utils/cache');
const { resolveTEU } = require('../../utils/teuResolver');
const { spanOf, voyageSegments, previewSpan } = require('./capacityLegs.logic');

const CACHE_TTL = 60_000; // 60 seconds

// ── Layer 2 statuses counted toward capacity (Sprint 025: Pending now included)
// ── Cancelled is the only exclusion (Sprint 047: hard delete means a
// ── deleted booking's row is simply gone, not a status to filter on).
const L2_STATUSES = ['Pending', 'Confirmed', 'Final Loading'];

// ── Layer 1 statuses counted toward capacity (planning indicator):
// ── Pending counts — only Cancelled is excluded.
const L1_STATUSES = ['Pending', 'Confirmed', 'Final Loading'];

// ── helpers ───────────────────────────────────────────────────────────────────
const cacheKey = (roundId) => `capacity:round:${String(roundId)}`;

// ─── computeRoundCapacity ─────────────────────────────────────────────────────
/**
 * Per-LEG capacity of a round (rewritten 2026-11-10, replaces the one-row-per-voyage chain, audit FL-01 / BK-02).
 *
 * A voyage is one run over the round's legs; its portCalls give the ports in order, so it has (ports - 1)
 * SEGMENTS. A booking (Layer 1 and Layer 2 alike) from POL to POD sits aboard on every segment between its two
 * calls on the voyage the server assigned to it, so the figure that matters is TEU aboard per segment against the
 * vessel capacity. The pure maths is in capacityLegs.logic.js.
 *
 * Per voyage row (shape kept for the existing screens):
 *   loadedTEU / dischargedTEU - totals over the run;  onboardTEU - the PEAK over its segments;
 *   remainingTEU / utilisationPct - from that peak;  segments[] / ports[] - the per-leg detail (new).
 * A discharge import marking a booking Remaining keeps its TEU aboard on every later segment of its run
 * (warning REMAINING_ONBOARD_PAST_DISCHARGE). Voyages are separate sailings: cargo never carries from one run
 * into the next. Cancelled voyages are excluded (their bookings are cancelled with them).
 *
 * @param {string|ObjectId} roundId
 * @param {{ statuses?: string[] }} opts  - overrides L2 statuses only
 */
const ALLOWED_CAPACITY_STATUSES = new Set(['Pending', 'Confirmed', 'Final Loading']);

const computeRoundCapacity = async (roundId, opts = {}) => {
  if (opts.statuses) {
    const invalid = opts.statuses.filter(s => !ALLOWED_CAPACITY_STATUSES.has(s));
    if (invalid.length > 0) {
      throw { status: 400, message: `Invalid booking statuses for capacity: ${invalid.join(', ')}. Allowed: Pending, Confirmed, Final Loading` };
    }
  }

  const l2Statuses = opts.statuses || L2_STATUSES;
  const useCache   = !opts.statuses;
  const key        = cacheKey(roundId);

  if (useCache) {
    const cached = cache.get(key);
    if (cached) return cached;
  }

  const round = await Round.findById(roundId)
    .populate('vesselId',  'vesselCode vesselName capacity')
    .populate('serviceId', 'serviceCode serviceName')
    .lean();
  if (!round) throw { status: 404, message: 'Round not found' };

  const vessel    = round.vesselId  || {};
  const service   = round.serviceId || {};
  const voyageIds = round.voyageIds || [];

  const [voyages, l2Bookings, l1Bookings] = await Promise.all([
    Voyage.find({ _id: { $in: voyageIds }, status: { $ne: 'Cancelled' } })
      .populate('polId', 'name code')
      .populate('podId', 'name code')
      .sort({ sequence: 1 })
      .lean(),
    Booking.find({ voyageId: { $in: voyageIds }, status: { $in: l2Statuses } })
      .select('voyageId polId podId polLegKey podLegKey containerTypeId containerNumber status dischargeStatus')
      .populate('containerTypeId', 'code size')
      .lean(),
    ManualBooking.find({ voyageId: { $in: voyageIds }, status: { $in: L1_STATUSES } })
      .select('totalTEU totalFreight totalUnits voyageId polId podId polLegKey podLegKey status bookingNumber')
      .lean(),
  ]);

  const cap      = vessel.capacity ?? null;
  const warnings = [];

  if (voyages.length < voyageIds.length) {
    warnings.push({
      code:    'CANCELLED_VOYAGES_EXCLUDED',
      message: `${voyageIds.length - voyages.length} cancelled voyage(s) excluded from capacity calculation`,
      count:   voyageIds.length - voyages.length,
    });
  }

  const byVoyage = new Map(); // voyageId -> { voyage, events[] }
  voyages.forEach(v => byVoyage.set(String(v._id), { voyage: v, events: [] }));

  // ── Layer 2: one booking = one container, TEU from its size ────────────────
  for (const b of l2Bookings) {
    if (!b.containerTypeId) {
      warnings.push({ code: 'MISSING_CONTAINER_TYPE', message: `Booking ${b._id} has no container type — excluded`, bookingId: b._id, containerNumber: b.containerNumber });
      continue;
    }
    const { teu, matched } = resolveTEU(b.containerTypeId.size);
    if (!matched) {
      warnings.push({ code: 'MISSING_TEU_MAPPING', message: `Unrecognised container size "${b.containerTypeId.size}" for booking ${b._id} — defaulting to 1 TEU`, bookingId: b._id, containerNumber: b.containerNumber, size: b.containerTypeId.size });
    }
    const slot = byVoyage.get(String(b.voyageId));
    if (!slot) {
      warnings.push({ code: 'BOOKING_PORT_NOT_IN_ROUND', message: `Booking ${b._id} voyage not found in this round (cancelled or missing) — excluded`, bookingId: b._id, containerNumber: b.containerNumber });
      continue;
    }
    const span = spanOf(slot.voyage.portCalls, b);
    if (!span) {
      warnings.push({ code: 'BOOKING_PORT_NOT_IN_ROUND', message: `Booking ${b._id} POL/POD not found on the run of its voyage — excluded`, bookingId: b._id, containerNumber: b.containerNumber });
      continue;
    }
    slot.events.push({ ...span, teu, layer: 'l2', stuckRemaining: b.dischargeStatus === 'Remaining' });
  }

  // ── Layer 1: whole estimate, TEU = totalTEU ───────────────────────────────
  for (const m of l1Bookings) {
    const slot = byVoyage.get(String(m.voyageId));
    if (!slot) {
      warnings.push({ code: 'L1_BOOKING_PORT_NOT_IN_ROUND', message: `Manual booking ${m.bookingNumber} voyage not found in this round (cancelled or missing) — excluded from capacity calculation`, bookingNumber: m.bookingNumber });
      continue;
    }
    const span = spanOf(slot.voyage.portCalls, m);
    if (!span) {
      warnings.push({ code: 'L1_BOOKING_PORT_NOT_IN_ROUND', message: `Manual booking ${m.bookingNumber} POL/POD not found on the run of its voyage — excluded from capacity calculation`, bookingNumber: m.bookingNumber });
      continue;
    }
    slot.events.push({ ...span, teu: m.totalTEU || 0, layer: 'l1' });
  }

  const voyageRows = [];
  let totalLoaded = 0;

  for (const v of voyages) {
    const { events } = byVoyage.get(String(v._id));
    const calls = v.portCalls || [];
    const r = voyageSegments(calls, events, cap);
    totalLoaded += r.loaded;

    const peak = r.peakOnboard;
    const remainingTEU   = cap != null ? cap - peak : null;
    const utilisationPct = cap != null && cap > 0 ? Math.round((peak / cap) * 100) : null;

    for (const sg of r.segments) {
      if (sg.remainingTEU != null && sg.remainingTEU < 0) {
        warnings.push({
          code:         'VOYAGE_OVERBOOKED',
          message:      `Voyage ${v.voyageNumber} overbooked by ${Math.abs(sg.remainingTEU)} TEU between ${sg.fromPort.name || sg.fromPort.code} and ${sg.toPort.name || sg.toPort.code}`,
          voyageId:     v._id,
          voyageNumber: v.voyageNumber,
          voyageName:   v.voyageName || null,
          segmentIndex: sg.index,
          over:         Math.abs(sg.remainingTEU),
        });
      }
    }
    let remainingOnboardTEU = 0;
    for (const [idx, teu] of Object.entries(r.remainingOnboardAt)) {
      remainingOnboardTEU += teu;
      warnings.push({
        code:         'REMAINING_ONBOARD_PAST_DISCHARGE',
        message:      `${teu} TEU still onboard past expected discharge at ${calls[idx]?.portName || 'port ' + idx} on voyage ${v.voyageNumber}`,
        voyageId:     v._id,
        voyageNumber: v.voyageNumber,
        voyageName:   v.voyageName || null,
        teu,
      });
    }

    // exact run = booking from the run's first to its last port (kept for the "Loaded" column of the old screens)
    const last = calls.length - 1;
    const exact = events.filter(e => e.polIdx === 0 && e.podIdx === last);
    const sum = (arr, layer) => arr.filter(e => !layer || e.layer === layer).reduce((a, e) => a + e.teu, 0);

    voyageRows.push({
      voyageId:      v._id,
      voyageNumber:  v.voyageNumber,
      voyageName:    v.voyageName || null,
      direction:     v.direction || null,
      sequence:      v.sequence,
      isManual:      v.isManual || false,
      fromPort: { portId: String(v.polId?._id || v.polId), name: v.polId?.name || '', code: v.polId?.code || '' },
      toPort:   { portId: String(v.podId?._id || v.podId), name: v.podId?.name || '', code: v.podId?.code || '' },
      etd:          v.etd,
      eta:          v.eta,
      voyageStatus: v.status,
      onboardStart:  0,                 // runs are separate sailings: nothing carries in
      loadedTEU:     r.loaded,
      dischargedTEU: r.discharged,
      onboardTEU:    peak,              // PEAK over the run's segments
      remainingTEU,
      utilisationPct,
      capacityBeforeLoading: cap,
      remainingOnboardTEU,
      layer1: { loadedTEU: r.loadedL1, dischargedTEU: r.dischargedL1 },
      layer2: { loadedTEU: r.loadedL2, dischargedTEU: r.dischargedL2 },
      loadedExact: { teu: sum(exact), layer1: sum(exact, 'l1'), layer2: sum(exact, 'l2') },
      // per-leg detail (new)
      segments: r.segments,
      ports:    r.ports,
    });
  }

  const peakOnboardTEU  = voyageRows.length ? Math.max(...voyageRows.map(v => v.onboardTEU)) : 0;
  const peakVoyage      = voyageRows.find(v => v.onboardTEU === peakOnboardTEU);
  const peakVoyageId    = peakVoyage ? peakVoyage.voyageId : null;
  const utilValues      = voyageRows.map(v => v.utilisationPct).filter(v => v != null);
  const avgUtilisationPct = utilValues.length ? Math.round(utilValues.reduce((a, b) => a + b, 0) / utilValues.length) : null;
  const totalL2Units    = l2Bookings.length;
  const totalL1Units    = l1Bookings.reduce((sum, m) => sum + (m.totalUnits || 0), 0);

  const result = {
    round: {
      _id:         round._id,
      roundNumber: round.roundNumber,
      roundName:   round.roundName || null,
      status:      round.status,
      startDate:   round.startDate,
      endDate:     round.endDate,
    },
    vessel: {
      _id:        vessel._id,
      vesselCode: vessel.vesselCode,
      vesselName: vessel.vesselName,
      capacity:   cap,
    },
    service: {
      _id:         service._id,
      serviceCode: service.serviceCode,
      serviceName: service.serviceName,
    },
    voyages: voyageRows,
    totals: {
      voyageCount:        voyageRows.length,
      peakOnboardTEU,
      peakVoyageId,
      avgUtilisationPct,
      totalLoadedTEU:     totalLoaded,
      totalBookedUnits:   totalL1Units + totalL2Units,
    },
    warnings,
  };

  if (useCache) cache.set(key, result, CACHE_TTL);
  return result;
};

// ─── computeVesselActiveCapacity ─────────────────────────────────────────────
const computeVesselActiveCapacity = async (vesselId) => {
  const vessel = await Vessel.findOne({ _id: vesselId })
    .select('vesselCode vesselName capacity')
    .lean();
  if (!vessel) throw { status: 404, message: 'Vessel not found' };

  const activeRound = await Round.findOne({
    vesselId:  vesselId,
    status:    'Active',
  }).lean();

  if (!activeRound) return { vessel, activeRound: null };

  const data = await computeRoundCapacity(activeRound._id);
  return { vessel, activeRound: data };
};

// ─── previews (pre-flight checks) ─────────────────────────────────────────────
/**
 * Would addedTEU more fit on EVERY segment between POL and POD of this voyage? (per-leg, both layers counted)
 * polId/podId missing = the whole run. Same result shape as before, plus the worst segment.
 */
const computeRoutePreview = async (roundId, { voyageId, polId = null, podId = null, polLegKey = null, podLegKey = null, addedTEU }) => {
  const current = await computeRoundCapacity(roundId);
  const cap     = current.vessel.capacity;
  const row     = current.voyages.find(v => String(v.voyageId) === String(voyageId));
  if (!row) throw { status: 400, message: 'Voyage not found in round capacity data' };

  const r = previewSpan(row, { polId, podId, polLegKey, podLegKey }, addedTEU, cap);
  if (!r) throw { status: 400, message: 'POL/POD not found on the run of this voyage' };

  return {
    canFit: r.canFit,
    addedTEU,
    voyage: {
      voyageId:         row.voyageId,
      voyageNumber:     row.voyageNumber,
      voyageName:       row.voyageName || null,
      onboardBefore:    r.onboardBefore,
      onboardAfter:     r.onboardAfter,
      remainingAfter:   r.remainingAfter,
      utilisationAfter: r.utilisationAfter,
      isBottleneck:     true,
      segment:          { from: r.worst.fromPort, to: r.worst.toPort },
    },
  };
};

// One container of the given type from POL to POD (POL optional: from the run's start).
const computeVoyagePreview = async (roundId, voyageId, containerTypeId, podId = null, polId = null) => {
  const ContainerType = require('../containerTypes/containerType.model');
  const ct = await ContainerType.findById(containerTypeId).select('size').lean();
  if (!ct) throw { status: 400, message: 'Container type not found' };
  const { teu } = resolveTEU(ct.size);
  return computeRoutePreview(roundId, { voyageId, polId: polId && podId ? polId : null, podId: polId && podId ? podId : null, addedTEU: teu });
};

// ─── cache invalidation ───────────────────────────────────────────────────────
const invalidateRoundCache = (roundId) => {
  if (roundId) cache.del(cacheKey(roundId));
};

module.exports = {
  computeRoundCapacity,
  computeVesselActiveCapacity,
  computeVoyagePreview,
  computeRoutePreview,
  invalidateRoundCache,
};
