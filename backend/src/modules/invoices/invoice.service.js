'use strict';

const Invoice  = require('./invoice.model');
const Booking  = require('../bookings/booking.model');
const { nextNumber }    = require('../../utils/autoNumber');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// ─── Status transitions ───────────────────────────────────────────────────────
const STATUS_TRANSITIONS = {
  Draft:     ['Issued', 'Cancelled'],
  Issued:    ['Paid', 'Overdue', 'Cancelled'],
  Overdue:   ['Paid', 'Cancelled'],
  Paid:      [],
  Cancelled: [],
};

const validateTransition = (current, next) => {
  const allowed = STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw {
      status: 400,
      message: `Cannot transition invoice from "${current}" to "${next}". Allowed: ${allowed.join(', ') || 'none'}`,
    };
  }
};

// ─── Populate ─────────────────────────────────────────────────────────────────
const pop = (q) =>
  q.populate('bookingId', 'bookingNumber totalFreight shipper consignee status quantity commodity polId podId voyageId agentId')
   .populate('agentId',   'agentCode agentName contacts');

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  bookingId = '', agentId = '', status = '',
  dateFrom = '', dateTo = '',
} = {}) => {
  const query = { isDeleted: false };
  if (bookingId) query.bookingId = bookingId;
  if (agentId)   query.agentId   = agentId;
  if (status)    query.status    = status;
  if (dateFrom || dateTo) {
    query.invoiceDate = {};
    if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
    if (dateTo)   query.invoiceDate.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    pop(Invoice.find(query)).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    Invoice.countDocuments(query),
  ]);
  return { data, total };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id) => {
  const inv = await pop(Invoice.findOne({ _id: id, isDeleted: false })).lean();
  if (!inv) throw { status: 404, message: 'Invoice not found' };
  return inv;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const create = async (data, createdBy) => {
  // Booking must exist and not be Cancelled
  const booking = await Booking.findOne({ _id: data.bookingId, isDeleted: false });
  if (!booking) throw { status: 400, message: 'Booking not found' };
  if (booking.status === 'Cancelled') throw { status: 400, message: 'Cannot create invoice for a cancelled booking' };

  // dueDate >= invoiceDate
  if (new Date(data.dueDate) < new Date(data.invoiceDate)) {
    throw { status: 400, message: 'Due date must be on or after invoice date' };
  }

  // Auto-fill agentId from booking if not provided
  const agentId = data.agentId || booking.agentId;

  const invoiceNumber = await nextNumber('invoice');

  const invoice = await Invoice.create({
    invoiceNumber,
    bookingId:   data.bookingId,
    agentId,
    invoiceDate: new Date(data.invoiceDate),
    dueDate:     new Date(data.dueDate),
    amount:      Number(data.amount),
    currency:    String(data.currency).toUpperCase(),
    status:      data.status || 'Draft',
    notes:       data.notes  || null,
    createdBy,
    updatedBy:   createdBy,
  });

  return getById(invoice._id);
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const invoice = await Invoice.findOne({ _id: id, isDeleted: false });
  if (!invoice) throw { status: 404, message: 'Invoice not found' };

  if (invoice.status === 'Paid') throw { status: 400, message: 'Paid invoices cannot be modified' };

  // Status transition
  if (data.status && data.status !== invoice.status) {
    validateTransition(invoice.status, data.status);
  }

  // dueDate validation if changing dates
  const invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : invoice.invoiceDate;
  const dueDate     = data.dueDate     ? new Date(data.dueDate)     : invoice.dueDate;
  if (dueDate < invoiceDate) {
    throw { status: 400, message: 'Due date must be on or after invoice date' };
  }

  const allowed = ['agentId', 'invoiceDate', 'dueDate', 'amount', 'currency', 'status', 'notes'];
  allowed.forEach(field => {
    if (data[field] !== undefined) {
      invoice[field] = field === 'currency' ? String(data[field]).toUpperCase() : data[field];
    }
  });
  if (data.amount !== undefined) invoice.amount = Number(data.amount);
  invoice.updatedBy = updatedBy;
  await invoice.save();
  return getById(invoice._id);
};

// ─── Soft Delete ──────────────────────────────────────────────────────────────
const softDelete = async (id, deletedBy) => {
  const invoice = await Invoice.findOne({ _id: id, isDeleted: false });
  if (!invoice) throw { status: 404, message: 'Invoice not found' };
  if (invoice.status === 'Paid') throw { status: 400, message: 'Paid invoices cannot be deleted' };

  invoice.isDeleted = true;
  invoice.deletedAt = new Date();
  invoice.updatedBy = deletedBy;
  await invoice.save();
};

// ─── Get by ID — deep populate for PDF generation ─────────────────────────
const getByIdForPdf = async (id) => {
  const inv = await Invoice.findOne({ _id: id, isDeleted: false })
    .populate({
      path: 'bookingId',
      select: 'bookingNumber totalFreight shipper consignee status quantity commodity polId podId voyageId freightRate',
      populate: [
        { path: 'polId', select: 'name code' },
        { path: 'podId', select: 'name code' },
        {
          path: 'voyageId', select: 'voyageNumber roundId',
          populate: {
            path: 'roundId', select: 'vesselId',
            populate: { path: 'vesselId', select: 'vesselName vesselCode' },
          },
        },
      ],
    })
    .populate('agentId', 'agentCode agentName contacts')
    .lean();
  if (!inv) throw { status: 404, message: 'Invoice not found' };
  return inv;
};

module.exports = { list, getById, getByIdForPdf, create, update, softDelete };
