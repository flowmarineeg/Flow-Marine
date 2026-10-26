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
    freightRate:     { type: Number, required: true, min: 0 },
    totalFreight:    { type: Number, required: true, min: 0 },
    commodity:       { type: String, trim: true, default: null },
    containerNumber: { type: String, trim: true, required: true, uppercase: true, index: true }, // Primary ref e.g. MSCU1234567
    vgm:             { type: Number, min: 0, default: null },                      // Verified Gross Mass (kg)
    dg:              { type: Boolean, default: false },                             // Dangerous Goods / Hazardous flag (UI label: 'Hazardous')
    imdgCode:        { type: String, trim: true, default: null, maxlength: 50 },    // IMDG Code (required when dg=true) — replaces dgPercent (Sprint026)
    containerStatus: { type: String, enum: ['Full', 'Empty'], default: null },      // Full or Empty only
    remarks:         { type: String, trim: true, default: null },
    status:          { type: String, enum: BOOKING_STATUS, default: 'Pending' },
    // Sprint 045 — actual operational outcome AFTER Final Loading, set only
    // by the 'discharge' import type. Additive, independent of `status`
    // (which stays 'Final Loading' forever regardless of discharge outcome).
    // null = not yet assessed (no discharge import has run for this
    // booking's voyage yet) — distinct from both real outcomes below.
    dischargeStatus: { type: String, enum: ['Discharged', 'Remaining'], default: null },
    dischargedAt:    { type: Date, default: null },
    // Sprint 051 (V2) - additive; old documents read as bill-to = their agent, source/term null.
    billToPartyId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
    customerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null }, // optional end customer / shipper (master data 11.3B)
    shipperSource:   { type: String, enum: ['Agent', 'Direct', null], default: null },
    paymentTerm:     { type: String, enum: ['Prepaid', 'Collect', null], default: null }, // informational only (D2-A)
    collectAgentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
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
bookingSchema.index({ voyageId: 1, status: 1 });
bookingSchema.index({ agentId:  1, status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
