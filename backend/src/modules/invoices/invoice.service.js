'use strict';

const mongoose      = require('mongoose');
const Invoice       = require('./invoice.model');
const Booking       = require('../bookings/booking.model');
const Voyage        = require('../voyages/voyage.model');
const Round         = require('../rounds/round.model');
const { nextNumber } = require('../../utils/autoNumber');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// ─── Status transitions (manual, pre-payment only) ────────────────────────────
// 'Partially Paid' and 'Paid' are DERIVED from Payments — never a manual
// transition target. See recalcInvoiceStatus().
const MANUAL_TRANSITIONS = {
  Draft:  ['Issued', 'Cancelled'],
  Issued: ['Cancelled'],
};

const validateManualTransition = (current, next) => {
  const allowed = MANUAL_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw {
      status: 400,
      message: `Cannot transition invoice from "${current}" to "${next}". Allowed: ${allowed.join(', ') || 'none'}`,
    };
  }
};

// ─── Populate ─────────────────────────────────────────────────────────────────
const pop = (q) =>
  q.populate('agentId', 'agentCode agentName contacts')
   .populate('voyageId', 'voyageNumber voyageName')
   .populate('roundId', 'roundNumber roundName')
   .populate('lineItems.bookingId', 'bookingNumber status containerNumber');

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  agentId = '', status = '', invoiceType = '',
  dateFrom = '', dateTo = '',
} = {}) => {
  const query = {};
  if (agentId)     query.agentId     = agentId;
  if (status)      query.status      = status;
  if (invoiceType) query.invoiceType = invoiceType;
  if (dateFrom || dateTo) {
    query.invoiceDate = {};
    if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
    if (dateTo)   query.invoiceDate.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    pop(Invoice.find(query)).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean({ virtuals: true }),
    Invoice.countDocuments(query),
  ]);
  return { data, total };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id) => {
  const inv = await pop(Invoice.findOne({ _id: id })).lean({ virtuals: true });
  if (!inv) throw { status: 404, message: 'Invoice not found' };
  return inv;
};

// ─── Get by ID — deep populate for PDF generation ─────────────────────────────
const getByIdForPdf = async (id) => {
  // Sprint 033: line items are self-contained historical snapshots — the PDF
  // never needs a live Booking read. Only agentId/voyageId/roundId are
  // populated, purely for the header labels.
  const inv = await Invoice.findOne({ _id: id })
    .populate('agentId', 'agentCode agentName contacts')
    .populate('voyageId', 'voyageNumber voyageName')
    .populate('roundId', 'roundNumber roundName')
    .lean({ virtuals: true });
  if (!inv) throw { status: 404, message: 'Invoice not found' };

  // Sprint 047 — actual recorded payments (date, amount, method, reference
  // — no per-booking allocations breakdown), for the PDF's Payments
  // Received table, one row per payment — replaces the old static
  // bank-wire-details block.
  const Payment = require('./payment.model');
  inv.payments = await Payment.find({ invoiceId: id, isVoided: false })
    .select('paymentDate amount method reference')
    .sort({ paymentDate: 1 })
    .lean();

  return inv;
};

// ─── Update Bill To (PDF contact details) ─────────────────────────────────────
// Sprint 047 — deliberately separate from update()'s lock logic: this is
// presentational data for the PDF, not financial, so it stays editable
// regardless of paidAmount/status. Does not touch dates/currency/notes/
// status or run validateManualTransition() at all.
const updateBillTo = async (id, billTo = {}) => {
  const invoice = await Invoice.findOne({ _id: id });
  if (!invoice) throw { status: 404, message: 'Invoice not found' };

  invoice.billTo = {
    phone:   billTo.phone   || null,
    mobile:  billTo.mobile  || null,
    email:   billTo.email   || null,
    jobCode: billTo.jobCode || null,
    taxId:   billTo.taxId   || null,
    address: billTo.address || null,
    office:  billTo.office  || null,
  };
  await invoice.save();
  return getById(id);
};

// ─── Already-invoiced check (Invoice-side only — see BOOKING–INVOICE OWNERSHIP) ─
const findActiveInvoiceIdsForBookings = async (bookingIds) => {
  const rows = await Invoice.find({
    'lineItems.bookingId': { $in: bookingIds },
    status: { $ne: 'Cancelled' },
  }, { 'lineItems.bookingId': 1 }).lean();

  const claimed = new Set();
  rows.forEach(inv => inv.lineItems.forEach(li => {
    if (bookingIds.some(id => String(id) === String(li.bookingId))) claimed.add(String(li.bookingId));
  }));
  return claimed;
};

// ─── Eligible bookings for Voyage/Round invoice composition (Decision 6) ──────
const getEligibleBookings = async ({ agentId, voyageId = '', roundId = '' }) => {
  if (!agentId) throw { status: 400, message: 'Agent is required' };
  if (!voyageId && !roundId) throw { status: 400, message: 'Voyage or Round is required' };

  const scopeQuery = { agentId, status: 'Final Loading' };
  if (voyageId) {
    scopeQuery.voyageId = voyageId;
  } else {
    const voyages = await Voyage.find({ roundId }).select('_id').lean();
    scopeQuery.voyageId = { $in: voyages.map(v => v._id) };
  }

  const bookings = await Booking.find(scopeQuery)
    .populate({ path: 'voyageId', select: 'voyageNumber voyageName roundId', populate: { path: 'roundId', select: 'roundNumber roundName' } })
    .populate('containerTypeId', 'code size type')
    .sort({ containerNumber: 1 })
    .lean();

  if (!bookings.length) return [];

  const claimed = await findActiveInvoiceIdsForBookings(bookings.map(b => b._id));

  return bookings
    .filter(b => !claimed.has(String(b._id)))
    .map(b => ({
      bookingId:       b._id,
      bookingNumber:   b.bookingNumber,
      containerNumber: b.containerNumber,
      // Sprint 044 — container type, for the invoice creation summary
      // overview (booking count / total revenue / per-container-type
      // breakdown) — additive only, nothing else in this function changes.
      containerType:   b.containerTypeId ? `${b.containerTypeId.code} ${b.containerTypeId.size}` : null,
      voyageId:        b.voyageId?._id || null,
      voyageNumber:    b.voyageId?.voyageNumber || null,
      voyageName:      b.voyageId?.voyageName || null,
      roundId:         b.voyageId?.roundId?._id || null,
      roundNumber:     b.voyageId?.roundId?.roundNumber || null,
      roundName:       b.voyageId?.roundId?.roundName || null,
      freightAmount:   b.totalFreight,
    }));
};

// ─── Build a line-item snapshot from a live Booking document (Revision 3) ─────
const buildLineItemSnapshot = async (booking) => {
  const voyage = await Voyage.findById(booking.voyageId)
    .populate('polId', 'name')
    .populate('podId', 'name')
    .lean();
  const round = voyage?.roundId ? await Round.findById(voyage.roundId).select('roundNumber roundName').lean() : null;

  return {
    bookingId:       booking._id,
    bookingNumber:   booking.bookingNumber,
    containerNumber: booking.containerNumber,
    voyageId:        voyage?._id || null,
    voyageNumber:    voyage?.voyageNumber || null,
    voyageName:      voyage?.voyageName || null,
    roundId:         round?._id || null,
    roundNumber:     round?.roundNumber || null,
    roundName:       round?.roundName || null,
    polName:         voyage?.polId?.name || null,
    podName:         voyage?.podId?.name || null,
    shipper:         booking.shipper || null,
    consignee:       booking.consignee || null,
    commodity:       booking.commodity || null,
    freightAmount:   booking.totalFreight,
  };
};

// ─── Create (Booking | Voyage | Round) ────────────────────────────────────────
// Sprint 033 Decision 1: every bookingId MUST resolve to a Final Loading
// Booking. Sprint 033 Revision 3: ownership of the booking↔invoice
// relationship lives entirely in Invoice.lineItems — nothing is written back
// to Booking. The claim check + insert run inside one transaction so two
// concurrent requests cannot both claim the same booking (Edge Case 4).
const create = async (data, createdBy) => {
  const { invoiceType, agentId, voyageId, roundId, bookingIds, invoiceDate, dueDate, currency, notes } = data;

  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    throw { status: 400, message: 'At least one booking is required' };
  }
  if (invoiceType === 'Voyage' && !voyageId) throw { status: 400, message: 'voyageId is required for a Voyage invoice' };
  if (invoiceType === 'Round'  && !roundId)  throw { status: 400, message: 'roundId is required for a Round invoice' };
  if (new Date(dueDate) < new Date(invoiceDate)) {
    throw { status: 400, message: 'Due date must be on or after invoice date' };
  }

  const bookings = await Booking.find({ _id: { $in: bookingIds } }).lean();
  if (bookings.length !== bookingIds.length) throw { status: 400, message: 'One or more bookings not found' };

  bookings.forEach(b => {
    if (b.status !== 'Final Loading') {
      throw { status: 400, message: `Booking ${b.bookingNumber} is not Final Loading — only Final Loading bookings can be invoiced` };
    }
    if (String(b.agentId) !== String(agentId)) {
      throw { status: 400, message: `Booking ${b.bookingNumber} does not belong to the selected agent` };
    }
  });

  const session = await mongoose.startSession();
  let invoice;
  try {
    await session.withTransaction(async () => {
      // Re-check claim status inside the transaction — closes the race
      // between reading the eligible-bookings list and this submit.
      const alreadyClaimed = await Invoice.find({
        'lineItems.bookingId': { $in: bookingIds },
        status: { $ne: 'Cancelled' },
      }, { 'lineItems.bookingId': 1 }).session(session).lean();

      if (alreadyClaimed.length) {
        const claimedIds = new Set();
        alreadyClaimed.forEach(inv => inv.lineItems.forEach(li => claimedIds.add(String(li.bookingId))));
        const conflict = bookings.find(b => claimedIds.has(String(b._id)));
        if (conflict) {
          throw { status: 400, message: `Booking ${conflict.bookingNumber} was just claimed by another invoice` };
        }
      }

      const lineItems = await Promise.all(bookings.map(b => buildLineItemSnapshot(b)));
      const totalAmount = lineItems.reduce((sum, li) => sum + li.freightAmount, 0);
      const invoiceNumber = await nextNumber('invoice');

      const [created] = await Invoice.create([{
        invoiceNumber,
        invoiceType,
        agentId,
        voyageId: invoiceType === 'Voyage' ? voyageId : null,
        roundId:  invoiceType === 'Round'  ? roundId  : null,
        lineItems,
        invoiceDate: new Date(invoiceDate),
        dueDate:     new Date(dueDate),
        currency:    String(currency).toUpperCase(),
        totalAmount,
        paidAmount:  0,
        status:      'Draft',
        notes:       notes || null,
        createdBy,
        updatedBy:   createdBy,
      }], { session });

      invoice = created;
    });
  } finally {
    session.endSession();
  }

  return getById(invoice._id);
};

// ─── Update (notes/dates/currency + manual Draft/Issued/Cancelled transitions) ─
// Sprint046: `canOverride` (invoices:override permission, or SuperAdmin) is an
// additive escape hatch — it skips the paidAmount/Paid|Cancelled lock below
// AND the narrow MANUAL_TRANSITIONS whitelist, letting an admin force `status`
// to any INVOICE_STATUS value at any time. Everything in this function stays
// the same for a non-override caller. recalcInvoiceStatus() (the payment-
// driven auto engine) is untouched — a later payment event may still
// recompute/overwrite whatever status is set here.
const update = async (id, data, updatedBy, canOverride = false) => {
  const invoice = await Invoice.findOne({ _id: id });
  if (!invoice) throw { status: 404, message: 'Invoice not found' };

  if (!canOverride) {
    if (invoice.paidAmount > 0) throw { status: 400, message: 'Invoices with recorded payments cannot be modified' };
    if (['Paid', 'Cancelled'].includes(invoice.status)) throw { status: 400, message: `${invoice.status} invoices cannot be modified` };
  }

  if (data.status && data.status !== invoice.status) {
    if (!canOverride) validateManualTransition(invoice.status, data.status);
    invoice.status = data.status;
  }

  const invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : invoice.invoiceDate;
  const dueDate     = data.dueDate     ? new Date(data.dueDate)     : invoice.dueDate;
  if (dueDate < invoiceDate) throw { status: 400, message: 'Due date must be on or after invoice date' };

  if (data.invoiceDate !== undefined) invoice.invoiceDate = invoiceDate;
  if (data.dueDate     !== undefined) invoice.dueDate     = dueDate;
  if (data.currency    !== undefined) invoice.currency    = String(data.currency).toUpperCase();
  if (data.notes       !== undefined) invoice.notes       = data.notes || null;

  invoice.updatedBy = updatedBy;
  await invoice.save();
  return getById(invoice._id);
};

// ─── Hard Delete ──────────────────────────────────────────────────────────────
const hardDelete = async (id) => {
  const invoice = await Invoice.findOne({ _id: id });
  if (!invoice) throw { status: 404, message: 'Invoice not found' };
  if (invoice.paidAmount > 0) throw { status: 400, message: 'Invoices with recorded payments cannot be deleted' };

  await Invoice.findByIdAndDelete(id);
};

// ─── Recalculate paidAmount + derived status from non-voided Payments ────────
// Called by payment.service.js after every create/void. Never called with a
// manual status value — Partially Paid/Paid/Overdue are always derived here.
const recalcInvoiceStatus = async (invoiceId, session = null) => {
  const Payment = require('./payment.model');
  const q = Payment.aggregate([
    { $match: { invoiceId: new mongoose.Types.ObjectId(String(invoiceId)), isVoided: false } },
    { $group: { _id: null, paidAmount: { $sum: '$amount' } } },
  ]);
  if (session) q.session(session);
  const [agg] = await q;
  const paidAmount = agg?.paidAmount || 0;

  const invoiceQuery = Invoice.findById(invoiceId);
  if (session) invoiceQuery.session(session);
  const invoice = await invoiceQuery;
  if (!invoice) throw { status: 404, message: 'Invoice not found' };

  let status;
  if (paidAmount <= 0) {
    status = invoice.dueDate && invoice.dueDate < new Date() ? 'Overdue' : 'Issued';
  } else if (paidAmount < invoice.totalAmount) {
    status = 'Partially Paid';
  } else {
    status = 'Paid';
  }

  invoice.paidAmount = paidAmount;
  invoice.status = status;
  await invoice.save({ session });
  return invoice;
};

module.exports = {
  list, getById, getByIdForPdf, create, update, hardDelete, updateBillTo,
  getEligibleBookings, findActiveInvoiceIdsForBookings, buildLineItemSnapshot,
  recalcInvoiceStatus,
};
