'use strict';

const mongoose = require('mongoose');
const { PAYMENT_METHODS } = require('../../config/constants');

// Sprint 033: explicit per-booking allocation — NOT proportional estimation.
// A payment states exactly which invoice line item(s) (bookings) it covers
// and how much for each. `amount` is always the derived sum of allocations.
const allocationSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  amount:    { type: Number, required: true, min: 0.01 },
}, { _id: false });

const paymentSchema = new mongoose.Schema(
  {
    invoiceId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    agentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',   required: true }, // denormalized for reporting
    allocations: { type: [allocationSchema], required: true, validate: v => Array.isArray(v) && v.length > 0 },
    amount:      { type: Number, required: true, min: 0.01 }, // derived: sum(allocations[].amount)
    paymentDate: { type: Date, required: true },
    method:      { type: String, enum: PAYMENT_METHODS, required: true },
    reference:   { type: String, trim: true, default: null },
    notes:       { type: String, trim: true, default: null },
    isVoided:    { type: Boolean, default: false },
    voidedAt:    { type: Date, default: null },
    voidedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    voidReason:  { type: String, trim: true, default: null },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Payments are append-only once created (never edited) — only voided. Same
// spirit as TrackingHistory/AuditLog. To correct an allocation, void the
// payment and record a new one.
paymentSchema.index({ invoiceId: 1, isVoided: 1 });
paymentSchema.index({ agentId: 1, paymentDate: -1 });
// Multikey — THE per-booking paid-amount lookup (bookingPaidAmount).
paymentSchema.index({ 'allocations.bookingId': 1 });

module.exports = mongoose.model('Payment', paymentSchema);
