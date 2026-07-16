'use strict';

const mongoose = require('mongoose');
const { INVOICE_STATUS } = require('../../config/constants');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    bookingId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    agentId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',   required: true },
    invoiceDate:   { type: Date, required: true },
    dueDate:       { type: Date, required: true },
    amount:        { type: Number, required: true, min: 0 },
    currency:      { type: String, required: true, trim: true, uppercase: true, maxlength: 10 },
    status:        { type: String, enum: INVOICE_STATUS, default: 'Draft' },
    notes:         { type: String, trim: true, default: null },
    isDeleted:     { type: Boolean, default: false },
    deletedAt:     { type: Date,    default: null },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// ── Compound indexes — Sprint020 DB-001 ───────────────────────────────────────
invoiceSchema.index({ bookingId: 1 });
invoiceSchema.index({ agentId: 1, status: 1, isDeleted: 1 });
invoiceSchema.index({ isDeleted: 1, invoiceDate: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
