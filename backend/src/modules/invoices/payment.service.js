'use strict';

const mongoose = require('mongoose');
const Payment  = require('./payment.model');
const Invoice  = require('./invoice.model');
const { recalcInvoiceStatus } = require('./invoice.service');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const PAYABLE_STATUSES = ['Issued', 'Partially Paid', 'Overdue'];

const pop = (q) =>
  q.populate('invoiceId', 'invoiceNumber invoiceType')
   .populate('agentId', 'agentCode agentName')
   .populate('allocations.bookingId', 'bookingNumber containerNumber');

// ─── List (Agent Details "Payments" tab) ──────────────────────────────────────
const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, agentId = '', invoiceId = '' } = {}) => {
  const query = { isVoided: false };
  if (agentId)   query.agentId   = agentId;
  if (invoiceId) query.invoiceId = invoiceId;

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    pop(Payment.find(query)).sort({ paymentDate: -1 }).skip(skip).limit(Number(limit)).lean(),
    Payment.countDocuments(query),
  ]);
  return { data, total };
};

// ─── List for a specific invoice (Invoice Detail payment history) ────────────
const listForInvoice = async (invoiceId) =>
  pop(Payment.find({ invoiceId }).sort({ paymentDate: -1 })).lean();

// ─── Per-booking already-allocated total (non-voided), for remaining-balance
//     checks — the exact figure Revision 4 requires, no estimation ───────────
const getBookingAllocatedTotal = async (invoiceId, bookingId, session = null) => {
  const pipeline = [
    { $match: { invoiceId: new mongoose.Types.ObjectId(String(invoiceId)), isVoided: false } },
    { $unwind: '$allocations' },
    { $match: { 'allocations.bookingId': new mongoose.Types.ObjectId(String(bookingId)) } },
    { $group: { _id: null, total: { $sum: '$allocations.amount' } } },
  ];
  const q = Payment.aggregate(pipeline);
  if (session) q.session(session);
  const [agg] = await q;
  return agg?.total || 0;
};

// ─── Create — explicit per-line-item allocation (Revision 4) ─────────────────
const create = async (invoiceId, data, createdBy) => {
  const { allocations, paymentDate, method, reference, notes } = data;

  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw { status: 400, message: 'At least one allocation is required' };
  }

  const invoice = await Invoice.findOne({ _id: invoiceId, isDeleted: false });
  if (!invoice) throw { status: 404, message: 'Invoice not found' };
  if (!PAYABLE_STATUSES.includes(invoice.status)) {
    throw { status: 400, message: `Cannot record a payment against an invoice with status "${invoice.status}"` };
  }

  const lineItemByBookingId = {};
  invoice.lineItems.forEach(li => { lineItemByBookingId[String(li.bookingId)] = li; });

  allocations.forEach(a => {
    const li = lineItemByBookingId[String(a.bookingId)];
    if (!li) throw { status: 400, message: 'Every allocation must reference a booking on this invoice' };
    if (!(Number(a.amount) > 0)) throw { status: 400, message: 'Every allocation amount must be greater than 0' };
  });

  const amount = allocations.reduce((sum, a) => sum + Number(a.amount), 0);

  const session = await mongoose.startSession();
  let payment;
  try {
    await session.withTransaction(async () => {
      // Re-check each booking's remaining balance inside the transaction —
      // closes the race between two concurrent payments allocating to the
      // same booking (Edge Case 6).
      for (const a of allocations) {
        const li = lineItemByBookingId[String(a.bookingId)];
        const alreadyAllocated = await getBookingAllocatedTotal(invoiceId, a.bookingId, session);
        const remaining = li.freightAmount - alreadyAllocated;
        if (Number(a.amount) > remaining + 1e-9) {
          throw { status: 400, message: `Allocation of ${a.amount} for booking ${li.bookingNumber} exceeds its remaining balance (${remaining.toFixed(2)})` };
        }
      }

      const [created] = await Payment.create([{
        invoiceId,
        agentId: invoice.agentId,
        allocations: allocations.map(a => ({ bookingId: a.bookingId, amount: Number(a.amount) })),
        amount,
        paymentDate: new Date(paymentDate),
        method,
        reference: reference || null,
        notes: notes || null,
        createdBy,
      }], { session });

      payment = created;
      await recalcInvoiceStatus(invoiceId, session);
    });
  } finally {
    session.endSession();
  }

  return pop(Payment.findById(payment._id)).lean();
};

// ─── Void — whole payment only, no partial-void of one allocation ────────────
const voidPayment = async (invoiceId, paymentId, { voidReason }, voidedBy) => {
  const payment = await Payment.findOne({ _id: paymentId, invoiceId, isVoided: false });
  if (!payment) throw { status: 404, message: 'Payment not found' };

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      payment.isVoided   = true;
      payment.voidedAt   = new Date();
      payment.voidedBy   = voidedBy;
      payment.voidReason = voidReason || null;
      await payment.save({ session });
      await recalcInvoiceStatus(invoiceId, session);
    });
  } finally {
    session.endSession();
  }

  return pop(Payment.findById(payment._id)).lean();
};

module.exports = { list, listForInvoice, create, voidPayment, getBookingAllocatedTotal };
