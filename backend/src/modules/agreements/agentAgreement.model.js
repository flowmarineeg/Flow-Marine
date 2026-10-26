'use strict';

const mongoose = require('mongoose');

// Sprint050 P7 — schema only; screens arrive in Sprint 052. Two independent
// deals per agent: port handling fees and commission (proposal §6).
const handlingFeeSchema = new mongoose.Schema(
  {
    moveType:        { type: String, enum: ['Load', 'Discharge'], required: true },
    containerStatus: { type: String, enum: ['Full', 'Empty'], required: true },
    amountMinor:     { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false }
);

const agentAgreementSchema = new mongoose.Schema(
  {
    agentId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
    currency:     { type: String, required: true, uppercase: true, default: 'USD', minlength: 3, maxlength: 3 },
    validFrom:    { type: Date, required: true },
    validTo:      { type: Date, default: null },
    handlingFees: { type: [handlingFeeSchema], default: [] },
    // Charge agreement: husbandry fee per port call (USD/agreement-currency minor units)
    husbandryFeePerCallMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    // Booking commission agreement: nothing accrues unless this is true
    earnsBookingCommission: { type: Boolean, default: false },
    commission: {
      rule:        { type: String, enum: ['fixedPerContainer', 'fixedPerBooking', 'percentOfRate', null], default: null },
      amountMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger }, // for the fixed rules
      percentBp:   { type: Number, default: 0, min: 0, max: 10000, validate: Number.isInteger }, // for percentOfRate
      basis:       { type: String, enum: ['Invoice', 'FinalLoading'], default: 'Invoice' },
    },
    status:    { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

agentAgreementSchema.index({ agentId: 1, validFrom: -1 });

module.exports = mongoose.model('AgentAgreement', agentAgreementSchema);
