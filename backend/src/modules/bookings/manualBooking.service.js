'use strict';

const ManualBooking = require('./manualBooking.model');
const Voyage        = require('../voyages/voyage.model');
const ContainerType = require('../containerTypes/containerType.model');
const { nextNumber }         = require('../../utils/autoNumber');
const { resolveTEU }         = require('../../utils/teuResolver');
const { invalidateRoundCache } = require('../capacity/capacity.service');
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
const computeTotals = (rows, sizeMap) => {
  let totalFreight = 0;
  let totalTEU     = 0;
  let totalUnits   = 0;

  const computed = rows.map(row => {
    const rowTotal = Number(row.quantity) * Number(row.rate);
    const size     = sizeMap[String(row.containerTypeId)] || '';
    const { teu }  = resolveTEU(size);
    totalFreight   += rowTotal;
    totalTEU       += Number(row.quantity) * teu;
    totalUnits     += Number(row.quantity);
    return { ...row, rowTotal };
  });

  return { computed, totalFreight, totalTEU, totalUnits };
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
  const query = { isDeleted: false };
  if (voyageId) query.voyageId = voyageId;
  if (agentId)  query.agentId  = agentId;
  if (status) {
    query.status = status.includes(',')
      ? { $in: status.split(',').map(s => s.trim()) }
      : status;
  }
  if (search) {
    query.$or = [{ bookingNumber: { $regex: search, $options: 'i' } }];
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
  const doc = await populate(ManualBooking.findOne({ _id: id, isDeleted: false })).lean();
  if (!doc) throw { status: 404, message: 'Manual booking not found' };
  return doc;
};

// ── Create ────────────────────────────────────────────────────────────────────
const create = async (data, createdBy) => {
  const voyage = await Voyage.findById(data.voyageId).lean();
  if (!voyage) throw { status: 400, message: 'Voyage not found' };
  if (['Cancelled', 'Completed'].includes(voyage.status)) {
    throw { status: 400, message: `Cannot book on a voyage with status "${voyage.status}"` };
  }

  const rows = data.cargoRows || [];
  if (!rows.length) throw { status: 400, message: 'At least one cargo row is required' };

  // Compute totals (resolve TEU from container type sizes)
  const sizeMap = await fetchSizeMap(rows.map(r => r.containerTypeId));
  const { computed, totalFreight, totalTEU, totalUnits } = computeTotals(rows, sizeMap);

  const bookingNumber = await nextNumber('manualBooking');

  const doc = await ManualBooking.create({
    bookingNumber,
    voyageId:     data.voyageId,
    agentId:      data.agentId,
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

  return getById(doc._id);
};

// ── Update ────────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const doc = await ManualBooking.findOne({ _id: id, isDeleted: false });
  if (!doc) throw { status: 404, message: 'Manual booking not found' };

  if (['Cancelled', 'Final Loading'].includes(doc.status)) {
    throw { status: 400, message: `${doc.status} bookings cannot be edited` };
  }

  if (data.status && data.status !== doc.status) {
    validateTransition(doc.status, data.status);
  }

  // If cargoRows provided, recompute all totals
  if (data.cargoRows !== undefined) {
    const rows = data.cargoRows;
    if (!rows.length) throw { status: 400, message: 'At least one cargo row is required' };
    const sizeMap = await fetchSizeMap(rows.map(r => r.containerTypeId));
    const { computed, totalFreight, totalTEU, totalUnits } = computeTotals(rows, sizeMap);
    doc.cargoRows    = computed;
    doc.totalFreight = totalFreight;
    doc.totalTEU     = totalTEU;
    doc.totalUnits   = totalUnits;
  }

  // Scalar fields
  if (data.agentId  !== undefined) doc.agentId  = data.agentId;
  if (data.remarks  !== undefined) doc.remarks  = data.remarks  || null;
  if (data.status   !== undefined) doc.status   = data.status;
  doc.updatedBy = updatedBy;

  await doc.save();

  const voyage = await Voyage.findById(doc.voyageId).select('roundId').lean();
  if (voyage) invalidateRoundCache(voyage.roundId);

  return getById(doc._id);
};

// ── Soft Delete ───────────────────────────────────────────────────────────────
const softDelete = async (id, deletedBy) => {
  const doc = await ManualBooking.findOne({ _id: id, isDeleted: false });
  if (!doc) throw { status: 404, message: 'Manual booking not found' };

  const voyage = await Voyage.findById(doc.voyageId).select('roundId').lean();
  doc.isDeleted = true;
  doc.deletedAt = new Date();
  doc.updatedBy = deletedBy;
  await doc.save();

  if (voyage) invalidateRoundCache(voyage.roundId);
};

module.exports = { list, getById, create, update, softDelete };
