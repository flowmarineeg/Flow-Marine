'use strict';

const mongoose = require('mongoose');
const { BOOKING_STATUS } = require('../../config/constants');

const cargoRowSchema = new mongoose.Schema(
  {
    containerTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContainerType', required: true },
    quantity:        { type: Number, required: true, min: 1 },
    rate:            { type: Number, required: true, min: 0 },
    dg:              { type: Boolean, default: false },
    dgValue:         { type: String, trim: true, default: null, maxlength: 200 }, // free text, e.g. "Class 3, UN1203"
    commodity:       { type: String, trim: true, default: null },
    vgm:             { type: Number, min: 0, default: null },  // estimated cargo weight (kg)
    rowTotal:        { type: Number, required: true, min: 0 }, // server-computed: quantity × rate
  },
  { _id: true }
);

const manualBookingSchema = new mongoose.Schema(
  {
    // ── Identifier ────────────────────────────────────────────────────────────
    bookingNumber: { type: String, required: true, unique: true, trim: true }, // MB-000001

    // ── Header ────────────────────────────────────────────────────────────────
    voyageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voyage', required: true },
    agentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',  required: true },
    polId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Port',   required: true },
    podId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Port',   required: true },

    // ── Cargo rows ────────────────────────────────────────────────────────────
    // Each row = one commercial cargo line (one container type block)
    // Commodity + VGM belong here, not on the booking header
    cargoRows: { type: [cargoRowSchema], required: true, validate: [v => v.length > 0, 'At least one cargo row is required'] },

    // ── Server-computed totals ────────────────────────────────────────────────
    totalFreight: { type: Number, required: true, min: 0 },  // sum(cargoRows[].rowTotal)
    totalTEU:     { type: Number, required: true, min: 0 },  // sum(qty × TEU(size))
    totalUnits:   { type: Number, required: true, min: 1 },  // sum(cargoRows[].quantity)

    // ── Other ─────────────────────────────────────────────────────────────────
    remarks:   { type: String, trim: true, default: null },
    status:    { type: String, enum: BOOKING_STATUS, default: 'Pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
manualBookingSchema.index({ voyageId: 1, status: 1 });
manualBookingSchema.index({ agentId:  1, status: 1 });

module.exports = mongoose.model('ManualBooking', manualBookingSchema);
