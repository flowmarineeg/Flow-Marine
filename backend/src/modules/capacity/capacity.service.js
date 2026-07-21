'use strict';

const Round         = require('../rounds/round.model');
const Voyage        = require('../voyages/voyage.model');
const Booking       = require('../bookings/booking.model');
const ManualBooking = require('../bookings/manualBooking.model');
const Vessel        = require('../vessels/vessel.model');
const cache         = require('../../utils/cache');
const { resolveTEU } = require('../../utils/teuResolver');

const CACHE_TTL = 60_000; // 60 seconds

// ── Layer 2 statuses counted toward capacity (operational confirmed cargo)
const L2_STATUSES = ['Confirmed', 'Final Loading'];

// ── Layer 1 statuses counted toward capacity (planning indicator):
// ── Pending counts — only Cancelled and Deleted are excluded.
const L1_STATUSES = ['Pending', 'Confirmed', 'Final Loading'];

// ── helpers ───────────────────────────────────────────────────────────────────
const cacheKey = (roundId) => `capacity:round:${String(roundId)}`;

// ─── computeRoundCapacity ─────────────────────────────────────────────────────
/**
 * Calculate per-voyage TEU capacity for a given round.
 *
 * Cargo flow model (NEW — Sprint 023 revision):
 *   Each voyage row tracks:
 *     loadedTEU      — TEU of cargo LOADED at this voyage's fromPort (POL)
 *     dischargedTEU  — TEU of cargo DISCHARGED at this voyage's toPort (POD)
 *     onboardStart   — TEU onboard before loading/discharging at this voyage
 *                      (inherited from previous voyage's onboardEnd)
 *     onboardTEU     — TEU onboard while transiting this voyage
 *                      = onboardStart + loadedTEU - dischargedTEU
 *     remainingTEU   — vessel.capacity - onboardTEU
 *
 *   The chain: onboardStart[n] = onboardTEU[n-1]
 *   First voyage: onboardStart = 0
 *
 * Matching logic:
 *   A booking is LOADED on the voyage whose fromPort.portId == booking.polId
 *   A booking is DISCHARGED on the voyage whose toPort.portId == booking.podId
 *
 *   For ManualBookings (multi-row, no per-row polId/podId):
 *     The booking-level polId/podId is used the same way.
 *
 * @param {string|ObjectId} roundId
 * @param {{ statuses?: string[] }} opts  — overrides L2 statuses only
 */
const computeRoundCapacity = async (roundId, opts = {}) => {
  const l2Statuses = opts.statuses || L2_STATUSES;
  const useCache   = !opts.statuses;
  const key        = cacheKey(roundId);

  if (useCache) {
    const cached = cache.get(key);
    if (cached) return cached;
  }

  // ── Step A: load round + voyages + bookings (parallel) ───────────────────
  const round = await Round.findById(roundId)
    .populate('vesselId',  'vesselCode vesselName capacity')
    .populate('serviceId', 'serviceCode serviceName')
    .lean();
  if (!round) throw { status: 404, message: 'Round not found' };

  const vessel    = round.vesselId  || {};
  const service   = round.serviceId || {};
  const voyageIds = round.voyageIds || [];

  const [voyages, l2Bookings, l1Bookings] = await Promise.all([
    Voyage.find({ _id: { $in: voyageIds } })
      .populate('polId', 'name code')
      .populate('podId', 'name code')
      .sort({ sequence: 1 })
      .lean(),

    // Layer 2 — operational bookings
    Booking.find({
      voyageId:  { $in: voyageIds },
      isDeleted: false,
      status:    { $in: l2Statuses },
    })
      .select('quantity voyageId polId podId containerTypeId containerNumber status')
      .populate('containerTypeId', 'code size isDeleted')
      .lean(),

    // Layer 1 — manual bookings (including Pending — planning indicator)
    ManualBooking.find({
      voyageId:  { $in: voyageIds },
      isDeleted: false,
      status:    { $in: L1_STATUSES },
    })
      .select('totalTEU totalFreight totalUnits voyageId polId podId status bookingNumber')
      .lean(),
  ]);

  const cap      = vessel.capacity ?? null;
  const warnings = [];

  // ── Step B: Build a port→voyageIndex map from the sorted voyage list ──────
  // This allows us to find which voyage a port belongs to as fromPort or toPort.
  // portAsFrom[portId] = voyage index where this port is the departure (fromPort/POL)
  // portAsTo[portId]   = voyage index where this port is the arrival  (toPort/POD)
  const portAsFrom = {}; // portId → voyage index (0-based)
  const portAsTo   = {}; // portId → voyage index (0-based)
  voyages.forEach((v, i) => {
    const fromId = String(v.polId?._id || v.polId);
    const toId   = String(v.podId?._id || v.podId);
    portAsFrom[fromId] = i;
    portAsTo[toId]     = i;
  });

  // ── Step C: Resolve TEU and validate each Layer 2 booking ────────────────
  // We also determine which voyage each booking LOADS on and DISCHARGES on.
  // A booking's voyageId tells us which voyage it is *attached to* (where it loads).
  // booking.polId = the actual load port (should match voyage.polId usually)
  // booking.podId = the actual discharge port (determines where it discharges)
  //
  // We use booking.polId to find the load voyage and booking.podId to find
  // the discharge voyage from the port maps above.

  const l2Events = []; // { loadVoyageIdx, dischargeVoyageIdx, teu }

  for (const b of l2Bookings) {
    if (!b.containerTypeId) {
      warnings.push({ code: 'MISSING_CONTAINER_TYPE', message: `Booking ${b._id} has no container type — excluded`, bookingId: b._id, containerNumber: b.containerNumber });
      continue;
    }
    if (b.containerTypeId.isDeleted) {
      warnings.push({ code: 'DELETED_CONTAINER_TYPE', message: `Booking ${b._id} uses soft-deleted container type ${b.containerTypeId.code} — proceeding`, bookingId: b._id, containerNumber: b.containerNumber });
    }
    const { teu, matched } = resolveTEU(b.containerTypeId.size);
    if (!matched) {
      warnings.push({ code: 'MISSING_TEU_MAPPING', message: `Unrecognised container size "${b.containerTypeId.size}" for booking ${b._id} — defaulting to 1 TEU`, bookingId: b._id, containerNumber: b.containerNumber, size: b.containerTypeId.size });
    }
    const effectiveTEU = b.quantity * teu;

    const polId = String(b.polId);
    const podId = String(b.podId);

    // Load at the voyage whose fromPort is this booking's POL
    const loadIdx = portAsFrom[polId];
    // Discharge at the voyage whose toPort is this booking's POD
    const dischargeIdx = portAsTo[podId];

    if (loadIdx == null) {
      warnings.push({ code: 'BOOKING_PORT_NOT_IN_ROUND', message: `Booking ${b._id} POL not found as a departure port in this round — excluded`, bookingId: b._id, containerNumber: b.containerNumber });
      continue;
    }
    if (dischargeIdx == null) {
      warnings.push({ code: 'BOOKING_PORT_NOT_IN_ROUND', message: `Booking ${b._id} POD not found as an arrival port in this round — excluded`, bookingId: b._id, containerNumber: b.containerNumber });
      continue;
    }
    if (loadIdx > dischargeIdx) {
      warnings.push({ code: 'INVALID_DIRECTION', message: `Booking ${b._id} POL comes after POD in voyage sequence — excluded`, bookingId: b._id, containerNumber: b.containerNumber });
      continue;
    }

    l2Events.push({ loadVoyageIdx: loadIdx, dischargeVoyageIdx: dischargeIdx, teu: effectiveTEU, source: 'l2' });
  }

  // ── Step D: Layer 1 manual bookings ──────────────────────────────────────
  // ManualBookings also carry polId/podId at the booking level.
  const l1Events = [];
  for (const m of l1Bookings) {
    const teu   = m.totalTEU || 0;
    const polId = String(m.polId);
    const podId = String(m.podId);

    const loadIdx      = portAsFrom[polId];
    const dischargeIdx = portAsTo[podId];

    if (loadIdx == null || dischargeIdx == null || loadIdx > dischargeIdx) {
      // Still count but aggregate to the attached voyage to avoid disappearing
      // Find voyage index from voyageId
      const voyageIdx = voyages.findIndex(v => String(v._id) === String(m.voyageId));
      if (voyageIdx >= 0) {
        l1Events.push({ loadVoyageIdx: voyageIdx, dischargeVoyageIdx: voyageIdx, teu, source: 'l1' });
      }
      continue;
    }

    l1Events.push({ loadVoyageIdx: loadIdx, dischargeVoyageIdx: dischargeIdx, teu, source: 'l1' });
  }

  const allEvents = [...l2Events, ...l1Events];

  // ── Step E: Per-voyage aggregation with cumulative onboard carry ──────────
  //
  // For each voyage[i]:
  //   loadedTEU[i]     = sum of teu for events where loadVoyageIdx == i
  //   dischargedTEU[i] = sum of teu for events where dischargeVoyageIdx == i
  //   onboardStart[i]  = onboardTEU[i-1]  (0 for first voyage)
  //   onboardTEU[i]    = onboardStart[i] + loadedTEU[i] - dischargedTEU[i]
  //
  // L1/L2 breakdown:
  //   loadedL1[i]      = l1 events loaded at i
  //   loadedL2[i]      = l2 events loaded at i
  //   (same for discharged)

  const loadedTEU     = new Array(voyages.length).fill(0);
  const dischargedTEU = new Array(voyages.length).fill(0);
  const loadedL1      = new Array(voyages.length).fill(0);
  const loadedL2      = new Array(voyages.length).fill(0);
  const dischargedL1  = new Array(voyages.length).fill(0);
  const dischargedL2  = new Array(voyages.length).fill(0);

  for (const ev of allEvents) {
    loadedTEU[ev.loadVoyageIdx]         += ev.teu;
    dischargedTEU[ev.dischargeVoyageIdx] += ev.teu;
    if (ev.source === 'l1') {
      loadedL1[ev.loadVoyageIdx]           += ev.teu;
      dischargedL1[ev.dischargeVoyageIdx]  += ev.teu;
    } else {
      loadedL2[ev.loadVoyageIdx]           += ev.teu;
      dischargedL2[ev.dischargeVoyageIdx]  += ev.teu;
    }
  }

  const voyageRows = [];
  let runningOnboard = 0;

  for (let i = 0; i < voyages.length; i++) {
    const v = voyages[i];
    const onboardStart   = runningOnboard;
    const loaded         = loadedTEU[i];
    const discharged     = dischargedTEU[i];
    const onboardTEU     = onboardStart + loaded - discharged;
    const remainingTEU   = cap != null ? cap - onboardTEU : null;
    const utilisationPct = cap != null ? Math.round((onboardTEU / cap) * 100) : null;

    if (remainingTEU != null && remainingTEU < 0) {
      warnings.push({
        code:         'VOYAGE_OVERBOOKED',
        message:      `Voyage ${v.voyageNumber} overbooked by ${Math.abs(remainingTEU)} TEU`,
        voyageId:     v._id,
        voyageNumber: v.voyageNumber,
        over:         Math.abs(remainingTEU),
      });
    }

    voyageRows.push({
      voyageId:      v._id,
      voyageNumber:  v.voyageNumber,
      sequence:      v.sequence,
      isManual:      v.isManual || false,
      fromPort: {
        portId: String(v.polId?._id || v.polId),
        name:   v.polId?.name || '',
        code:   v.polId?.code || '',
      },
      toPort: {
        portId: String(v.podId?._id || v.podId),
        name:   v.podId?.name || '',
        code:   v.podId?.code || '',
      },
      etd:          v.etd,
      eta:          v.eta,
      voyageStatus: v.status,
      // Cargo flow fields
      onboardStart,        // TEU onboard before any activity at this voyage's ports
      loadedTEU:    loaded,
      dischargedTEU: discharged,
      onboardTEU,          // TEU onboard while transiting (after load, before discharge at POD)
      remainingTEU,
      utilisationPct,
      // L1/L2 breakdown
      layer1: {
        loadedTEU:     loadedL1[i],
        dischargedTEU: dischargedL1[i],
      },
      layer2: {
        loadedTEU:     loadedL2[i],
        dischargedTEU: dischargedL2[i],
      },
    });

    runningOnboard = onboardTEU;
  }

  // ── Step F: totals ────────────────────────────────────────────────────────
  const onboardValues     = voyageRows.map(v => v.onboardTEU);
  const peakOnboardTEU    = onboardValues.length ? Math.max(...onboardValues) : 0;
  const peakVoyageIndex   = voyageRows.findIndex(v => v.onboardTEU === peakOnboardTEU);
  const peakVoyageId      = peakVoyageIndex >= 0 ? voyageRows[peakVoyageIndex].voyageId : null;

  const utilValues        = voyageRows.map(v => v.utilisationPct).filter(v => v != null);
  const avgUtilisationPct = utilValues.length
    ? Math.round(utilValues.reduce((a, b) => a + b, 0) / utilValues.length)
    : null;

  const totalLoadedTEU    = loadedTEU.reduce((s, v) => s + v, 0);
  const totalBookedUnits  = [...l2Events, ...l1Events].reduce((s, _) => s, 0); // event count doesn't equal units, compute from source
  const totalL2Units      = l2Bookings.reduce((s, b) => s + (b.quantity || 0), 0);
  const totalL1Units      = l1Bookings.reduce((s, m) => s + (m.totalUnits || 0), 0);

  const result = {
    round: {
      _id:         round._id,
      roundNumber: round.roundNumber,
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
      totalLoadedTEU,
      totalBookedUnits:   totalL1Units + totalL2Units,
    },
    warnings,
  };

  if (useCache) cache.set(key, result, CACHE_TTL);
  return result;
};

// ─── computeVesselActiveCapacity ─────────────────────────────────────────────
const computeVesselActiveCapacity = async (vesselId) => {
  const vessel = await Vessel.findOne({ _id: vesselId, isDeleted: false })
    .select('vesselCode vesselName capacity')
    .lean();
  if (!vessel) throw { status: 404, message: 'Vessel not found' };

  const activeRound = await Round.findOne({
    vesselId:  vesselId,
    status:    'Active',
    isDeleted: false,
  }).lean();

  if (!activeRound) return { vessel, activeRound: null };

  const data = await computeRoundCapacity(activeRound._id);
  return { vessel, activeRound: data };
};

// ─── computeVoyagePreview ─────────────────────────────────────────────────────
const computeVoyagePreview = async (roundId, voyageId, quantity, containerTypeId) => {
  const ContainerType = require('../containerTypes/containerType.model');
  const ct = await ContainerType.findById(containerTypeId).select('size').lean();
  if (!ct) throw { status: 400, message: 'Container type not found' };

  const { teu }  = resolveTEU(ct.size);
  const addedTEU = quantity * teu;

  const current   = await computeRoundCapacity(roundId);
  const cap       = current.vessel.capacity;
  const voyageRow = current.voyages.find(v => String(v.voyageId) === String(voyageId));
  if (!voyageRow) throw { status: 400, message: 'Voyage not found in round capacity data' };

  const onboardAfter   = voyageRow.onboardTEU + addedTEU;
  const remainingAfter = cap != null ? cap - onboardAfter : null;
  const canFit         = remainingAfter == null || remainingAfter >= 0;

  return {
    canFit,
    addedTEU,
    voyage: {
      voyageId:        voyageRow.voyageId,
      voyageNumber:    voyageRow.voyageNumber,
      onboardBefore:   voyageRow.onboardTEU,
      onboardAfter,
      remainingAfter,
      utilisationAfter: cap ? Math.round((onboardAfter / cap) * 100) : null,
    },
  };
};

// ─── cache invalidation ───────────────────────────────────────────────────────
const invalidateRoundCache = (roundId) => {
  if (roundId) cache.del(cacheKey(roundId));
};

module.exports = {
  computeRoundCapacity,
  computeVesselActiveCapacity,
  computeVoyagePreview,
  invalidateRoundCache,
};
