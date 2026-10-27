'use strict';

const lock = require('../rounds/roundLock');
const ManualBooking = require('./manualBooking.model');
const Voyage        = require('../voyages/voyage.model');
const ContainerType = require('../containerTypes/containerType.model');
const { nextNumber }         = require('../../utils/autoNumber');
const { resolveTEU }         = require('../../utils/teuResolver');
const { escapeRegex }        = require('../../utils/escapeRegex');
const { invalidateRoundCache } = require('../capacity/capacity.service');
const logger = require('../../utils/logger');
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
  q.populate('voyageId', 'voyageNumber voyageName roundId polId podId etd eta status')
   .populate('agentId',  'agentCode agentName')
   .populate('polId',    'name code')
   .populate('podId',    'name code')
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
    const rowTotal   = Number(row.quantity) * Number(row.rate);
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
    return { ...row, rowTotal };
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
  search = '', voyageId = '', agentId = '', status = '',
} = {}) => {
  const query = {};
  if (voyageId) query.voyageId = voyageId;
  if (agentId)  query.agentId  = agentId;
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
const getById = async (id) => {
  const doc = await populate(ManualBooking.findOne({ _id: id })).lean();
  if (!doc) throw { status: 404, message: 'Manual booking not found' };
  return doc;
};

// ── Create ────────────────────────────────────────────────────────────────────
const create = async (data, createdBy) => {
  await lock.assertVoyageRoundOpen(data.voyageId);
  const voyage = await Voyage.findById(data.voyageId).lean();
  if (!voyage) throw { status: 400, message: 'Voyage not found' };
  if (['Cancelled', 'Completed'].includes(voyage.status)) {
    throw { status: 400, message: `Cannot book on a voyage with status "${voyage.status}"` };
  }
  await lock.assertRoundBookable(voyage);

  const rows = data.cargoRows || [];
  if (!rows.length) throw { status: 400, message: 'At least one cargo row is required' };

  // Compute totals (resolve TEU from container type sizes)
  const sizeMap = await fetchSizeMap(rows.map(r => r.containerTypeId));
  const { computed, totalFreight, totalTEU, totalUnits, warnings } = computeTotals(rows, sizeMap);
  warnings.forEach(w => logger.warn(`[ManualBooking.create] ${w.message}`));

  await require('../agents/agent.service').assertBookingSource(data.agentId);
  const bookingNumber = await nextNumber('manualBooking');

  const doc = await ManualBooking.create({
    bookingNumber,
    voyageId:     data.voyageId,
    agentId:      data.agentId,
    customerId:   data.customerId || null,
    // Sprint 030: POL/POD are no longer client-submitted — always the
    // selected voyage's own polId/podId.
    polId:        voyage.polId,
    podId:        voyage.podId,
    cargoRows:    computed,
    totalFreight,
    totalTEU,
    totalUnits,
    remarks:      data.remarks  || null,
    status:       data.status   || 'Pending',
    createdBy,
    updatedBy:    createdBy,
  });

  // Capacity: Pending manual bookings count immediately (planning indicator)
  invalidateRoundCache(voyage.roundId);

  const saved = await getById(doc._id);
  if (warnings.length) saved._teuWarnings = warnings;
  return saved;
};

// ── Update ────────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  await lock.assertDocRoundOpen('ManualBooking', id);
  const doc = await ManualBooking.findOne({ _id: id });
  if (!doc) throw { status: 404, message: 'Manual booking not found' };

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
  if (data.agentId  !== undefined) {
    if (String(data.agentId) !== String(doc.agentId)) await require('../agents/agent.service').assertBookingSource(data.agentId);
    doc.agentId = data.agentId;
  }
  if (data.customerId !== undefined) doc.customerId = data.customerId || null;
  if (data.remarks  !== undefined) doc.remarks  = data.remarks  || null;
  if (data.status   !== undefined) doc.status   = data.status;
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
const hardDelete = async (id) => {
  await lock.assertDocRoundOpen('ManualBooking', id);
  const doc = await ManualBooking.findOne({ _id: id });
  if (!doc) throw { status: 404, message: 'Manual booking not found' };

  const voyage = await Voyage.findById(doc.voyageId).select('roundId').lean();
  await ManualBooking.findByIdAndDelete(id);

  if (voyage) invalidateRoundCache(voyage.roundId);
};

module.exports = { list, getById, create, update, hardDelete };
