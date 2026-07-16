'use strict';

const mongoose  = require('mongoose');
const Booking   = require('./booking.model');
const Voyage    = require('../voyages/voyage.model');
const Port      = require('../locations/port.model');
const { nextNumber } = require('../../utils/autoNumber');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// ─── Status transition map ────────────────────────────────────────────────────
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
      message: `Cannot transition booking from "${current}" to "${next}". Allowed: ${allowed.join(', ') || 'none'}`,
    };
  }
};

// ─── Sprint020 PERF-011: single aggregate replaces 3 sequential queries ───────
const getVoyagePortIds = async (voyageId) => {
  const result = await Voyage.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(String(voyageId)) } },
    {
      $lookup: {
        from:         'routes',
        localField:   'serviceId',
        foreignField: 'serviceId',
        as:           'route',
      },
    },
    { $unwind: { path: '$route', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from:         'routelegs',
        localField:   'route._id',
        foreignField: 'routeId',
        as:           'legs',
      },
    },
    { $project: { portIds: '$legs.portId' } },
  ]);

  if (!result.length) throw { status: 404, message: 'Voyage not found' };
  return (result[0].portIds || []).map(String);
};

// ─── Populate helper ──────────────────────────────────────────────────────────
const populate = (q) =>
  q.populate('voyageId', 'voyageNumber polId podId etd eta status')
   .populate({ path: 'voyageId', populate: [{ path: 'polId', select: 'name code' }, { path: 'podId', select: 'name code' }] })
   .populate('agentId',         'agentCode agentName')
   .populate('polId',           'name code')
   .populate('podId',           'name code')
   .populate('containerTypeId', 'code size type');

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  search = '', voyageId = '', agentId = '',
  status = '', dateFrom = '', dateTo = '',
} = {}) => {
  const query = { isDeleted: false };
  if (voyageId) query.voyageId = voyageId;
  if (agentId)  query.agentId  = agentId;
  if (status) {
    // Support comma-separated statuses e.g. "Confirmed,Pending"
    query.status = status.includes(',')
      ? { $in: status.split(',').map(s => s.trim()) }
      : status;
  }
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo)   query.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }
  if (search) {
    query.$or = [
      { bookingNumber: { $regex: search, $options: 'i' } },
      { shipper:       { $regex: search, $options: 'i' } },
      { consignee:     { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    populate(Booking.find(query)).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Booking.countDocuments(query),
  ]);

  return { data, total };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id) => {
  const booking = await populate(Booking.findOne({ _id: id, isDeleted: false })).lean();
  if (!booking) throw { status: 404, message: 'Booking not found' };
  return booking;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const create = async (data, createdBy) => {
  const voyage = await Voyage.findById(data.voyageId).lean();
  if (!voyage) throw { status: 400, message: 'Voyage not found' };
  if (['Cancelled', 'Completed'].includes(voyage.status)) {
    throw { status: 400, message: `Cannot book on a voyage with status "${voyage.status}"` };
  }

  if (String(data.polId) === String(data.podId)) {
    throw { status: 400, message: 'Port of Loading and Port of Discharge must be different' };
  }

  const validPortIds = await getVoyagePortIds(data.voyageId);
  if (validPortIds.length > 0) {
    if (!validPortIds.includes(String(data.polId)))
      throw { status: 400, message: "POL port is not part of this voyage's route" };
    if (!validPortIds.includes(String(data.podId)))
      throw { status: 400, message: "POD port is not part of this voyage's route" };
  }

  const bookingNumber = await nextNumber('booking');
  const totalFreight  = Number(data.quantity) * Number(data.freightRate);
  const { totalFreight: _ig, ...safeData } = data;

  const booking = await Booking.create({
    ...safeData,
    bookingNumber,
    totalFreight,
    status:    data.status === 'Cancelled' ? 'Pending' : (data.status || 'Pending'),
    createdBy,
    updatedBy: createdBy,
  });

  return getById(booking._id);
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const booking = await Booking.findOne({ _id: id, isDeleted: false });
  if (!booking) throw { status: 404, message: 'Booking not found' };

  if (['Cancelled', 'Final Loading'].includes(booking.status)) {
    throw { status: 400, message: `${booking.status} bookings cannot be edited` };
  }

  if (data.status && data.status !== booking.status) {
    validateTransition(booking.status, data.status);
  }

  const polId = data.polId || String(booking.polId);
  const podId = data.podId || String(booking.podId);
  if (String(polId) === String(podId)) {
    throw { status: 400, message: 'Port of Loading and Port of Discharge must be different' };
  }

  const quantity    = data.quantity    !== undefined ? Number(data.quantity)    : booking.quantity;
  const freightRate = data.freightRate !== undefined ? Number(data.freightRate) : booking.freightRate;
  const totalFreight = quantity * freightRate;

  const { totalFreight: _ig1, bookingNumber: _ig2, voyageId: _ig3, ...safeData } = data;
  Object.assign(booking, { ...safeData, totalFreight, updatedBy });
  await booking.save();
  return getById(booking._id);
};

// ─── Soft Delete ──────────────────────────────────────────────────────────────
const softDelete = async (id, deletedBy) => {
  const booking = await Booking.findOne({ _id: id, isDeleted: false });
  if (!booking) throw { status: 404, message: 'Booking not found' };

  let Invoice;
  try { Invoice = require('../invoices/invoice.model'); } catch { Invoice = null; }
  if (Invoice) {
    const hasInvoice = await Invoice.exists({ bookingId: id, isDeleted: false });
    if (hasInvoice) throw { status: 400, message: 'Cannot delete — an invoice exists for this booking' };
  }

  booking.isDeleted = true;
  booking.deletedAt = new Date();
  booking.updatedBy = deletedBy;
  await booking.save();
};

// ─── Get voyage ports (for booking form dropdown) ─────────────────────────────
const getVoyagePorts = async (voyageId) => {
  const portIds = await getVoyagePortIds(voyageId);
  if (portIds.length === 0) return [];
  return Port.find({ _id: { $in: portIds }, isDeleted: false }).select('name code').lean();
};

module.exports = { list, getById, create, update, softDelete, getVoyagePorts };
