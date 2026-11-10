'use strict';

const lock = require('../rounds/roundLock');
const ManualBooking = require('./manualBooking.model');
const Voyage        = require('../voyages/voyage.model');
const ContainerType = require('../containerTypes/containerType.model');
const { nextNumber }         = require('../../utils/autoNumber');
const { resolveTEU }         = require('../../utils/teuResolver');
const { escapeRegex }        = require('../../utils/escapeRegex');
const { invalidateRoundCache, computeRoutePreview } = require('../capacity/capacity.service');
const { capacityEnforcement } = require('../../config/env');
const logger = require('../../utils/logger');
const Port = require('../locations/port.model');
const { resolveVoyage } = require('./bookingVoyage.service');
const { assertPartner, assertOwn } = require('./partnerScope');
const { DEFAULT_PAGE, DEFAULT_LIMIT, BOOKING_STATUS } = require('../../config/constants');

// ── Status machine (identical to Layer 2) ────────────────────────────────────
const STATUS_TRANSITIONS = {
  Pending:         ['Confirmed', 'Final Loading', 'Cancelled'],
  Confirmed:       ['Final Loading', 'Cancelled'],
  'Final Loading': ['Cancelled'],
  Cancelled:       [],
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

// ── Populate helper ───────────────────────────────────────────────────────────
const populate = (q) =>
  q.populate('voyageId', 'voyageNumber voyageName direction roundId polId podId etd eta status')
   .populate('agentId',  'agentCode agentName')
   .populate('polId',    'name code')
   .populate('podId',    'name code')
   .populate('partnerId', 'code name')
   .populate('cargoRows.containerTypeId', 'code size type');

// ── Compute totals from cargoRows ─────────────────────────────────────────────
// Requires rows to already have containerTypeId.size populated or fetched.
// Post-audit fix (system-audit-2026-8-3.md §3.2): a lookup miss here (the
// row's containerTypeId no longer resolves to a ContainerType — possible
// since Sprint 047 made ContainerType.hardDelete a real delete) used to
// silently fall through resolveTEU('') -> {teu:1, matched:false} with no
// signal anywhere, unlike capacity.service.js's explicit
// MISSING_CONTAINER_TYPE/MISSING_TEU_MAPPING warnings for the identical
// case. `warnings` now surfaces the same signal — the 1-TEU default itself
// is UNCHANGED (still the fail-safe), only its visibility is fixed.
const computeTotals = (rows, sizeMap) => {
  let totalFreight = 0;
  let totalTEU     = 0;
  let totalUnits   = 0;
  const warnings   = [];

  const computed = rows.map((row, idx) => {
    const rate       = Number(row.rate) || 0; // the rate is optional on an estimate
    const rowTotal   = Number(row.quantity) * rate;
    const ctId       = String(row.containerTypeId);
    const ctExists   = Object.prototype.hasOwnProperty.call(sizeMap, ctId);
    const size       = sizeMap[ctId] || '';
    const { teu, matched } = resolveTEU(size);

    if (!ctExists) {
      warnings.push({
        code: 'MISSING_CONTAINER_TYPE', rowIndex: idx, containerTypeId: ctId,
        message: `Cargo row ${idx + 1} references a container type that no longer exists — defaulting to 1 TEU`,
      });
    } else if (!matched) {
      warnings.push({
        code: 'MISSING_TEU_MAPPING', rowIndex: idx, size,
        message: `Unrecognised container size "${size}" in cargo row ${idx + 1} — defaulting to 1 TEU`,
      });
    }

    totalFreight   += rowTotal;
    totalTEU       += Number(row.quantity) * teu;
    totalUnits     += Number(row.quantity);
    return { ...row, rate, rowTotal };
  });

  return { computed, totalFreight, totalTEU, totalUnits, warnings };
};

// ── Fetch size map for a set of containerTypeIds ──────────────────────────────
const fetchSizeMap = async (containerTypeIds) => {
  const unique = [...new Set(containerTypeIds.map(String))];
  const cts    = await ContainerType.find({ _id: { $in: unique } }).select('_id size').lean();
  const map    = {};
  cts.forEach(ct => { map[String(ct._id)] = ct.size; });
  return map;
};

// ── List ──────────────────────────────────────────────────────────────────────
const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  search = '', voyageId = '', agentId = '', roundId = '', partnerId = '', status = '',
} = {}, scope = null) => {
  const query = {};
  if (roundId) query.voyageId = { $in: await Voyage.find({ roundId }).distinct('_id') };
  if (voyageId) query.voyageId = voyageId;
  if (agentId)  query.agentId  = agentId;
  if (scope) query.partnerId = scope;
  else if (partnerId) query.partnerId = partnerId;
  if (status) {
    query.status = status.includes(',')
      ? { $in: status.split(',').map(s => s.trim()) }
      : status;
  }
  if (search) {
    query.$or = [{ bookingNumber: { $regex: escapeRegex(search), $options: 'i' } }];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    populate(ManualBooking.find(query)).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    ManualBooking.countDocuments(query),
  ]);

  return { data, total };
};

// ── Get by ID ─────────────────────────────────────────────────────────────────
const getById = async (id, scope = null) => {
  const doc = await populate(ManualBooking.findOne({ _id: id })).lean();
  if (!doc) throw { status: 404, message: 'Manual booking not found' };
  if (scope && String(doc.partnerId?._id || doc.partnerId || '') !== scope) throw { status: 404, message: 'Manual booking not found' };
  return doc;
};

// ── Create ────────────────────────────────────────────────────────────────────
// Bookings sprint 2026-11-10: roundId + the booking's own POL/POD; the voyage is assigned by the server.
const create = async (data, createdBy, scope = null) => {
  const { voyage, polLegKey, podLegKey } = await resolveVoyage({
    roundId: data.roundId, polId: data.polId, podId: data.podId,
    polLegKey: data.polLegKey, podLegKey: data.podLegKey, voyageId: data.voyageId,
  });
  const [pol, pod] = await Promise.all([Port.exists({ _id: data.polId }), Port.exists({ _id: data.podId })]);
  if (!pol || !pod) throw { status: 400, message: 'POL or POD port not found' };

  const rows = data.cargoRows || [];
  if (!rows.length) throw { status: 400, message: 'At least one cargo row is required' };

  // Compute totals (resolve TEU from container type sizes)
  const sizeMap = await fetchSizeMap(rows.map(r => r.containerTypeId));
  const { computed, totalFreight, totalTEU, totalUnits, warnings } = computeTotals(rows, sizeMap);
  warnings.forEach(w => logger.warn(`[ManualBooking.create] ${w.message}`));

  await require('../agents/agent.service').assertBookingSource(data.agentId);

  // Pre-flight capacity check for the estimate too (both layers hold space; env ENABLE_CAPACITY_ENFORCEMENT)
  const enforcementMode = capacityEnforcement();
  let capacityWarning = null;
  if (enforcementMode && totalTEU > 0) {
    try {
      const preview = await computeRoutePreview(voyage.roundId, { voyageId: String(voyage._id), polId: String(data.polId), podId: String(data.podId), polLegKey, podLegKey, addedTEU: totalTEU });
      if (!preview.canFit) {
        if (enforcementMode === 'strict') {
          throw { status: 400, message: `Estimate would exceed vessel capacity on voyage ${preview.voyage?.voyageNumber}. Added ${totalTEU} TEU; remaining after: ${preview.voyage?.remainingAfter} TEU.`, capacityPreview: preview };
        }
        capacityWarning = preview;
      }
    } catch (capErr) {
      if (capErr.status === 400 && capErr.capacityPreview) throw capErr;
    }
  }
  const bookingNumber = await nextNumber('manualBooking');

  const doc = await ManualBooking.create({
    bookingNumber,
    voyageId:     voyage._id,
    agentId:      data.agentId,
    customerId:   data.customerId || null,
    polId:        data.polId,
    podId:        data.podId,
    polLegKey, podLegKey,
    partnerId:    scope || await assertPartner(data.partnerId),
    source:       scope ? 'PartnerUser' : 'Staff',
    cargoRows:    computed,
    totalFreight,
    totalTEU,
    totalUnits,
    remarks:      data.remarks  || null,
    status:       scope || !data.status || data.status === 'Cancelled' ? 'Pending' : data.status,
    createdBy,
    updatedBy:    createdBy,
  });

  // Capacity: Pending manual bookings count immediately (planning indicator)
  invalidateRoundCache(voyage.roundId);

  const saved = await getById(doc._id);
  if (warnings.length) saved._teuWarnings = warnings;
  if (capacityWarning) saved._capacityWarning = capacityWarning;
  return saved;
};

// ── Update ────────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy, scope = null) => {
  await lock.assertDocRoundOpen('ManualBooking', id);
  const doc = await ManualBooking.findOne({ _id: id });
  if (!doc) throw { status: 404, message: 'Manual booking not found' };
  assertOwn(doc, scope);
  if (scope && data.status && data.status !== doc.status) {
    throw { status: 403, message: 'Partner users cannot change the status of a booking' };
  }

  if (['Cancelled', 'Final Loading'].includes(doc.status)) {
    throw { status: 400, message: `${doc.status} bookings cannot be edited` };
  }

  if (data.status && data.status !== doc.status) {
    validateTransition(doc.status, data.status);
  }

  // If cargoRows provided, recompute all totals
  let updateWarnings = [];
  if (data.cargoRows !== undefined) {
    const rows = data.cargoRows;
    if (!rows.length) throw { status: 400, message: 'At least one cargo row is required' };
    const sizeMap = await fetchSizeMap(rows.map(r => r.containerTypeId));
    const { computed, totalFreight, totalTEU, totalUnits, warnings } = computeTotals(rows, sizeMap);
    updateWarnings = warnings;
    warnings.forEach(w => logger.warn(`[ManualBooking.update] ${w.message}`));
    doc.cargoRows    = computed;
    doc.totalFreight = totalFreight;
    doc.totalTEU     = totalTEU;
    doc.totalUnits   = totalUnits;
  }

  // Scalar fields
  if (data.agentId  !== undefined && !scope) {
    if (String(data.agentId) !== String(doc.agentId)) await require('../agents/agent.service').assertBookingSource(data.agentId);
    doc.agentId = data.agentId;
  }
  if (data.customerId !== undefined) doc.customerId = data.customerId || null;
  if (!scope && data.partnerId !== undefined) doc.partnerId = await assertPartner(data.partnerId);
  if (data.remarks  !== undefined) doc.remarks  = data.remarks  || null;
  if (data.status   !== undefined && !scope) doc.status = data.status;
  doc.updatedBy = updatedBy;

  await doc.save();

  const voyage = await Voyage.findById(doc.voyageId).select('roundId').lean();
  if (voyage) invalidateRoundCache(voyage.roundId);

  const saved = await getById(doc._id);
  if (updateWarnings.length) saved._teuWarnings = updateWarnings;
  return saved;
};

// ── Hard Delete ───────────────────────────────────────────────────────────────
// No guard — matches the existing rule (ManualBooking had no delete guard
// before this sprint either; not adding one now, per "do not redesign
// business rules unless required for referential integrity").
const hardDelete = async (id, scope = null) => {
  await lock.assertDocRoundOpen('ManualBooking', id);
  const doc = await ManualBooking.findOne({ _id: id });
  if (!doc) throw { status: 404, message: 'Manual booking not found' };
  assertOwn(doc, scope);
  if (scope && doc.status !== 'Pending') throw { status: 403, message: 'Partner users can only delete Pending bookings' };

  const voyage = await Voyage.findById(doc.voyageId).select('roundId').lean();
  await ManualBooking.findByIdAndDelete(id);

  if (voyage) invalidateRoundCache(voyage.roundId);
};

module.exports = { list, getById, create, update, hardDelete };
