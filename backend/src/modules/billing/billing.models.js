'use strict';

const mongoose = require('mongoose');
const oid = (ref, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref, default: null, ...extra });

// ─── BookingItem (D1-A) - derived pricing group over Final Loading bookings ───
const bookingItemSchema = new mongoose.Schema(
  {
    billToAgentId:   oid('Agent', { required: true }),
    voyageId:        oid('Voyage', { required: true }),
    roundId:         oid('Round'),
    containerTypeId: oid('ContainerType', { required: true }),
    freightRate:     { type: Number, required: true, min: 0 },
    loadedQty:       { type: Number, required: true, min: 0 },
    bookingIds:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
    locked:          { type: Boolean, default: false },   // true while a live InvoiceLine owns it
    invoiceLineId:   oid('InvoiceLine'),
  },
  { timestamps: true }
);
bookingItemSchema.index({ billToAgentId: 1, voyageId: 1, containerTypeId: 1, freightRate: 1 }, { unique: true });
bookingItemSchema.index({ roundId: 1, billToAgentId: 1 });

// ─── InvoiceLine - THE DB-level "one invoice per item" guarantee ──────────────
const invoiceLineSchema = new mongoose.Schema(
  {
    invoiceId:     oid('Invoice', { required: true }),
    bookingItemId: oid('BookingItem', { required: true }),
    qty:           { type: Number, required: true, min: 1 },
    priceMinor:    { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    amountMinor:   { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    currency:      { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    cancelled:     { type: Boolean, default: false },
    snapshot: {
      voyageLabel:  { type: String, default: null },
      roundNumber:  { type: String, default: null },
      containerType:{ type: String, default: null },
      freightRate:  { type: Number, default: null },
    },
  },
  { timestamps: true }
);
// An item can sit on at most ONE live (non-cancelled) invoice line.
invoiceLineSchema.index(
  { bookingItemId: 1 },
  { unique: true, partialFilterExpression: { cancelled: false }, name: 'one_live_line_per_item' }
);
invoiceLineSchema.index({ invoiceId: 1 });

// ─── InvoiceSettlement (D4-A) - replaces Payment for V2 invoices ──────────────
const invoiceSettlementSchema = new mongoose.Schema(
  {
    invoiceId:   oid('Invoice', { required: true }),
    agentId:     oid('Agent', { required: true }),
    kind:        { type: String, enum: ['Cash', 'Offset'], default: 'Cash' }, // Offset is produced by the netting engine (Sprint 052)
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency:    { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    method:      { type: String, enum: ['Bank Transfer', 'Cash', 'Cheque', 'Other'], default: 'Bank Transfer' },
    bankAccount: {
      type:      { type: String, enum: ['Company', 'Partner'], default: 'Company' },
      partnerId: oid('Partner'),
    },
    date:        { type: Date, required: true },
    reference:   { type: String, trim: true, default: null },
    notes:       { type: String, trim: true, default: null },
    status:      { type: String, enum: ['Posted', 'Voided'], default: 'Posted' },
    ledgerEntryId:  oid('JournalEntry'),
    voidEntryId:    oid('JournalEntry'),
    voidedAt:    { type: Date, default: null },
    voidedBy:    oid('User'),
    voidReason:  { type: String, trim: true, default: null },
    createdBy:   oid('User'),
  },
  { timestamps: true }
);
invoiceSettlementSchema.index({ invoiceId: 1, status: 1 });
invoiceSettlementSchema.index({ agentId: 1, date: -1 });

module.exports = {
  BookingItem: mongoose.model('BookingItem', bookingItemSchema),
  InvoiceLine: mongoose.model('InvoiceLine', invoiceLineSchema),
  InvoiceSettlement: mongoose.model('InvoiceSettlement', invoiceSettlementSchema),
};
