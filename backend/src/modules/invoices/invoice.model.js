'use strict';

const mongoose = require('mongoose');
const { INVOICE_STATUS, INVOICE_TYPES } = require('../../config/constants');

// Sprint 033: a line item is a full financial/historical SNAPSHOT taken at
// the moment a booking is added to an invoice — not a live reference. Once
// written these fields are never re-read from the live Booking/Voyage/Round
// documents; bookingId/voyageId/roundId remain only as links for drill-down
// and for the orphan-flagging lookup in bookingImport.service.js.
const lineItemSchema = new mongoose.Schema({
  bookingId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  bookingNumber:   { type: String, trim: true, default: null },
  containerNumber: { type: String, trim: true, default: null },
  voyageId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Voyage', default: null },
  voyageNumber:    { type: String, trim: true, default: null },
  voyageName:      { type: String, trim: true, default: null },
  roundId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Round', default: null },
  roundNumber:     { type: String, trim: true, default: null },
  roundName:       { type: String, trim: true, default: null },
  polName:         { type: String, trim: true, default: null },
  podName:         { type: String, trim: true, default: null },
  shipper:         { type: String, trim: true, default: null },
  consignee:       { type: String, trim: true, default: null },
  commodity:       { type: String, trim: true, default: null },
  freightAmount:   { type: Number, required: true, min: 0 },
  orphaned:        { type: Boolean, default: false },
  orphanedAt:      { type: Date, default: null },
  orphanedReason:  { type: String, trim: true, default: null },
}, { _id: true });

// Sprint 047 — PDF "Bill To" contact details, entered per-invoice (not
// pulled from Agent — a given invoice may need its own job-specific
// contact/billing details). Purely presentational data for the generated
// PDF; not financial, so it stays editable regardless of the invoice's
// paid/locked state (see invoice.service.js#updateBillTo — a separate,
// always-open code path from the main update()'s lock).
const billToSchema = new mongoose.Schema({
  phone:   { type: String, trim: true, default: null },
  mobile:  { type: String, trim: true, default: null },
  email:   { type: String, trim: true, default: null },
  jobCode: { type: String, trim: true, default: null },
  taxId:   { type: String, trim: true, default: null },
  address: { type: String, trim: true, default: null },
  office:  { type: String, trim: true, default: null },
}, { _id: false });

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    invoiceType:   { type: String, enum: INVOICE_TYPES, required: true, default: 'Booking' },
    agentId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',  required: true },
    voyageId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Voyage', default: null }, // required if invoiceType='Voyage'
    roundId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Round',  default: null }, // required if invoiceType='Round'
    lineItems:     { type: [lineItemSchema], required: true, validate: v => Array.isArray(v) && v.length > 0 },
    invoiceDate:   { type: Date, required: true },
    dueDate:       { type: Date, required: true },
    currency:      { type: String, required: true, trim: true, uppercase: true, maxlength: 10 },
    totalAmount:   { type: Number, required: true, min: 0 }, // server sum of lineItems.freightAmount
    paidAmount:    { type: Number, default: 0, min: 0 },      // denormalized sum of non-voided Payments
    status:        { type: String, enum: INVOICE_STATUS, default: 'Draft' },
    notes:         { type: String, trim: true, default: null },
    billTo:        { type: billToSchema, default: () => ({}) },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

invoiceSchema.virtual('balanceAmount').get(function () {
  return Math.max(0, (this.totalAmount || 0) - (this.paidAmount || 0));
});
invoiceSchema.set('toJSON',   { virtuals: true });
invoiceSchema.set('toObject', { virtuals: true });

// ── Compound indexes ───────────────────────────────────────────────────────────
invoiceSchema.index({ agentId: 1, status: 1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ voyageId: 1 });
invoiceSchema.index({ roundId: 1 });
// Sprint 033 — THE booking↔invoice ownership index. This is the single
// source of truth for "is this booking already invoiced" (queried as
// { 'lineItems.bookingId': id, status: { $ne: 'Cancelled' } }) — there is
// deliberately no field on Booking for this; see sprints/033-sprint.txt
// "BOOKING–INVOICE OWNERSHIP".
invoiceSchema.index({ 'lineItems.bookingId': 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
