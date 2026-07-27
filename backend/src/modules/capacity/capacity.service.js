'use strict';

const Round         = require('../rounds/round.model');
const Voyage        = require('../voyages/voyage.model');
const Booking       = require('../bookings/booking.model');
const ManualBooking = require('../bookings/manualBooking.model');
const Vessel        = require('../vessels/vessel.model');
const cache         = require('../../utils/cache');
const { resolveTEU } = require('../../utils/teuResolver');

const CACHE_TTL = 60_000; // 60 seconds

// ── Layer 2 statuses counted toward capacity (Sprint 025: Pending now included)
// ── Cancelled and isDeleted=true are the only exclusions.
const L2_STATUSES = ['Pending', 'Confirmed', 'Final Loading'];

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
    // BUG-010: Cancelled voyages are not physical sailings and must never
    // participate in the cargo-flow chain, capacity, onboard, or remaining
    // capacity calculations — excluded here at the source.
    Voyage.find({ _id: { $in: voyageIds }, status: { $ne: 'Cancelled' } })
      .populate('polId', 'name code')
      .populate('podId', 'name code')
      .sort({ sequence: 1 })
      .lean(),

    // Layer 2 — operational bookings (Sprint 025: quantity removed; TEU from container size only)
    Booking.find({
      voyageId:  { $in: voyageIds },
      isDeleted: false,
      status:    { $in: l2Statuses },
    })
      .select('voyageId polId podId containerTypeId containerNumber status')
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

  // BUG-010: warn if any of the round's voyageIds were excluded because they
  // are cancelled. Bookings still attached to those voyages will naturally
  // fail voyage-anchored resolution below and be warned/excluded.
  if (voyages.length < voyageIds.length) {
    warnings.push({
      code:    'CANCELLED_VOYAGES_EXCLUDED',
      message: `${voyageIds.length - voyages.length} cancelled voyage(s) excluded from capacity calculation`,
      count:   voyageIds.length - voyages.length,
    });
  }

  // ── Step B (REVISION 3): discharge-voyage resolution is voyage-based, NOT a
  // global port map. Repeated ports within the same round make a global
  // portAsTo/portAsFrom map ambiguous. Instead, each booking is anchored on
  // its own voyageId (the voyage it is attached to / loads on) and we walk
  // forward through the sorted voyage sequence from there to find the first
  // voyage whose toPort matches the booking's POD.
  const voyageIndexById = {}; // voyageId → index in the sorted `voyages` array
  voyages.forEach((v, i) => { voyageIndexById[String(v._id)] = i; });

  const resolveDischargeIdx = (loadIdx, podId) => {
    for (let i = loadIdx; i < voyages.length; i++) {
      const toId = String(voyages[i].podId?._id || voyages[i].podId);
      if (toId === String(podId)) return i;
    }
    return null;
  };

  // ── Step C: Resolve TEU and validate each Layer 2 booking ────────────────
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
    // Sprint 025: one booking = one container; TEU derived from size only (no quantity)
    const effectiveTEU = teu;

    // Anchor on the booking's actual attached voyage (REVISION 3) — never a global port map.
    const loadIdx = voyageIndexById[String(b.voyageId)];
    if (loadIdx == null) {
      warnings.push({ code: 'BOOKING_PORT_NOT_IN_ROUND', message: `Booking ${b._id} voyage not found in this round (cancelled or missing) — excluded`, bookingId: b._id, containerNumber: b.containerNumber });
      continue;
    }

    const dischargeIdx = resolveDischargeIdx(loadIdx, b.podId);
    if (dischargeIdx == null) {
      warnings.push({ code: 'BOOKING_PORT_NOT_IN_ROUND', message: `Booking ${b._id} POD not found ahead of its load voyage in this round — excluded`, bookingId: b._id, containerNumber: b.containerNumber });
      continue;
    }

    // Sprint 029: exact-segment flag for "Loaded" column presentation —
    // compared against the booking's own polId/podId, NOT loadIdx===dischargeIdx.
    const anchorVoyage = voyages[loadIdx];
    const exactSegment =
      String(b.polId) === String(anchorVoyage.polId?._id || anchorVoyage.polId) &&
      String(b.podId) === String(anchorVoyage.podId?._id || anchorVoyage.podId);

    l2Events.push({ loadVoyageIdx: loadIdx, dischargeVoyageIdx: dischargeIdx, teu: effectiveTEU, source: 'l2', exactSegment });
  }

  // ── Step D: Layer 1 manual bookings (REVISION 2 + REVISION 3) ────────────
  // Voyage-anchored resolution, same as Step C. If POL/POD cannot be
  // resolved, warn and EXCLUDE the booking entirely — no synthetic
  // load-only or load+discharge event is created.
  const l1Events = [];
  for (const m of l1Bookings) {
    const teu = m.totalTEU || 0;

    const loadIdx = voyageIndexById[String(m.voyageId)];
    if (loadIdx == null) {
      warnings.push({
        code:    'L1_BOOKING_PORT_NOT_IN_ROUND',
        message: `Manual booking ${m.bookingNumber} voyage not found in this round (cancelled or missing) — excluded from capacity calculation`,
        bookingNumber: m.bookingNumber,
      });
      continue;
    }

    const dischargeIdx = resolveDischargeIdx(loadIdx, m.podId);
    if (dischargeIdx == null) {
      warnings.push({
        code:    'L1_BOOKING_PORT_NOT_IN_ROUND',
        message: `Manual booking ${m.bookingNumber} POL/POD could not be resolved in round — excluded from capacity calculation`,
        bookingNumber: m.bookingNumber,
      });
      continue;
    }

    // Sprint 029: exact-segment flag for "Loaded" column presentation —
    // compared against the booking's own polId/podId, NOT loadIdx===dischargeIdx.
    const anchorVoyage = voyages[loadIdx];
    const exactSegment =
      String(m.polId) === String(anchorVoyage.polId?._id || anchorVoyage.polId) &&
      String(m.podId) === String(anchorVoyage.podId?._id || anchorVoyage.podId);

    l1Events.push({ loadVoyageIdx: loadIdx, dischargeVoyageIdx: dischargeIdx, teu, source: 'l1', exactSegment });
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

  // Sprint 029: exact-segment "Loaded" figures for presentation only.
  // Populated only when booking.polId==voyage.fromPort AND booking.podId==voyage.toPort.
  // Does NOT feed the onboard chain — loadedTEU/dischargedTEU above remain the
  // source of truth for onboardStart/onboardTEU/remainingTEU/utilisationPct.
  const loadedExactTEU = new Array(voyages.length).fill(0);
  const loadedExactL1  = new Array(voyages.length).fill(0);
  const loadedExactL2  = new Array(voyages.length).fill(0);

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

    if (ev.exactSegment) {
      loadedExactTEU[ev.loadVoyageIdx] += ev.teu;
      if (ev.source === 'l1') loadedExactL1[ev.loadVoyageIdx] += ev.teu;
      else                    loadedExactL2[ev.loadVoyageIdx] += ev.teu;
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
        voyageName:   v.voyageName || null,
        over:         Math.abs(remainingTEU),
      });
    }

    voyageRows.push({
      voyageId:      v._id,
      voyageNumber:  v.voyageNumber,
      voyageName:    v.voyageName || null,
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
      // Sprint 038 — presentation-only, additive field for the Round
      // Capacity Report's per-voyage cards (same category as Sprint 029's
      // loadedExact: computed alongside the real onboard chain, never fed
      // back into it). "How much TEU room existed before this voyage's
      // own load/discharge activity" — the complement to remainingTEU,
      // which is room left AFTER that activity.
      capacityBeforeLoading: cap != null ? cap - onboardStart : null,
      // L1/L2 breakdown
      layer1: {
        loadedTEU:     loadedL1[i],
        dischargedTEU: dischargedL1[i],
      },
      layer2: {
        loadedTEU:     loadedL2[i],
        dischargedTEU: dischargedL2[i],
      },
      // Sprint 029: exact-segment "Loaded" figures for UI presentation only
      // (booking.polId==voyage.fromPort AND booking.podId==voyage.toPort).
      // Does not drive onboardTEU/remainingTEU/utilisationPct above.
      loadedExact: {
        teu:    loadedExactTEU[i],
        layer1: loadedExactL1[i],
        layer2: loadedExactL2[i],
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
  // Sprint 025: L2 = one container per booking (no quantity); L2 units = booking count
  const totalL2Units      = l2Bookings.length;
  const totalL1Units      = l1Bookings.reduce((s, m) => s + (m.totalUnits || 0), 0);

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
// Sprint 025: quantity param removed — one booking = one container; TEU from size only
// Sprint 028 (BUG-004, REVISION 3): optional podId checks ALL voyages the
// container transits, resolved by walking forward from the load voyage
// through the round's voyage sequence — never a global port map.
const computeVoyagePreview = async (roundId, voyageId, containerTypeId, podId = null) => {
  const ContainerType = require('../containerTypes/containerType.model');
  const ct = await ContainerType.findById(containerTypeId).select('size').lean();
  if (!ct) throw { status: 400, message: 'Container type not found' };

  const { teu }  = resolveTEU(ct.size);
  const addedTEU = teu; // one container contributes exactly its size TEU

  const current   = await computeRoundCapacity(roundId);
  const cap       = current.vessel.capacity;
  const loadIdx   = current.voyages.findIndex(v => String(v.voyageId) === String(voyageId));
  if (loadIdx === -1) throw { status: 400, message: 'Voyage not found in round capacity data' };

  if (podId) {
    // Voyage-based discharge resolution (REVISION 3): start at the load
    // voyage's index and walk forward to the first voyage whose toPort
    // matches podId. No global portAsTo map — repeated ports in the same
    // round would make such a map ambiguous.
    let dischargeIdx = null;
    for (let i = loadIdx; i < current.voyages.length; i++) {
      if (String(current.voyages[i].toPort.portId) === String(podId)) {
        dischargeIdx = i;
        break;
      }
    }

    if (dischargeIdx != null) {
      // The container transits every voyage from loadIdx to dischargeIdx inclusive.
      const transitVoyages = current.voyages.slice(loadIdx, dischargeIdx + 1);
      let bottleneckVoyage = null;
      let minRemaining = Infinity;

      for (const tv of transitVoyages) {
        const onboardAfterOnThisVoyage = tv.onboardTEU + addedTEU;
        const remainingOnThisVoyage = cap != null ? cap - onboardAfterOnThisVoyage : null;
        if (remainingOnThisVoyage != null && remainingOnThisVoyage < minRemaining) {
          minRemaining = remainingOnThisVoyage;
          bottleneckVoyage = tv;
        }
      }

      if (bottleneckVoyage) {
        const onboardAfter   = bottleneckVoyage.onboardTEU + addedTEU;
        const remainingAfter = cap != null ? cap - onboardAfter : null;
        const canFit         = remainingAfter == null || remainingAfter >= 0;
        return {
          canFit,
          addedTEU,
          voyage: {
            voyageId:        bottleneckVoyage.voyageId,
            voyageNumber:    bottleneckVoyage.voyageNumber,
            voyageName:      bottleneckVoyage.voyageName || null,
            onboardBefore:   bottleneckVoyage.onboardTEU,
            onboardAfter,
            remainingAfter,
            utilisationAfter: cap ? Math.round((onboardAfter / cap) * 100) : null,
            isBottleneck:    true,
          },
        };
      }
    }
    // Fall through to load-voyage-only check if discharge could not be resolved
    // or capacity is uncapped (bottleneckVoyage stays null).
  }

  // Fallback / default: check the load voyage only (existing behaviour).
  const voyageRow = current.voyages[loadIdx];
  const onboardAfter   = voyageRow.onboardTEU + addedTEU;
  const remainingAfter = cap != null ? cap - onboardAfter : null;
  const canFit         = remainingAfter == null || remainingAfter >= 0;

  return {
    canFit,
    addedTEU,
    voyage: {
      voyageId:        voyageRow.voyageId,
      voyageNumber:    voyageRow.voyageNumber,
      voyageName:      voyageRow.voyageName || null,
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
