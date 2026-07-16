'use strict';

const mongoose = require('mongoose');
const { BOOKING_STATUS } = require('../../config/constants');

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber:   { type: String, required: true, unique: true, trim: true },
    voyageId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Voyage',        required: true },
    agentId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',         required: true },
    shipper:         { type: String, trim: true, default: null, maxlength: 200 },
    consignee:       { type: String, trim: true, default: null, maxlength: 200 },
    carrierName:     { type: String, trim: true, default: null, maxlength: 200 },
    polId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Port',          required: true },
    podId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Port',          required: true },
    containerTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContainerType', required: true },
    quantity:        { type: Number, required: true, min: 1 },
    freightRate:     { type: Number, required: true, min: 0 },
    totalFreight:    { type: Number, required: true, min: 0 },
    commodity:       { type: String, trim: true, default: null },
    remarks:         { type: String, trim: true, default: null },
    status:          { type: String, enum: BOOKING_STATUS, default: 'Pending' },
    isDeleted:       { type: Boolean, default: false },
    deletedAt:       { type: Date,    default: null },
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// bookingNumber: unique:true in the field definition already creates the index.
// Do NOT add bookingSchema.index({ bookingNumber:1 }) here — that causes a
// Mongoose "Duplicate schema index" warning.

// ── Compound indexes — Sprint020 DB-001 ───────────────────────────────────────
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ voyageId: 1, status: 1, isDeleted: 1 });
bookingSchema.index({ agentId:  1, status: 1, isDeleted: 1 });
bookingSchema.index({ isDeleted: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
