'use strict';

const mongoose = require('mongoose');
const { VESSEL_STATUS, OWNERSHIP_TYPES } = require('../../config/constants');

const ownerContactSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true, maxlength: 100 },
  title: { type: String, trim: true, default: null, maxlength: 100 },
  phone: { type: String, trim: true, default: null, maxlength: 40 },
  email: { type: String, trim: true, lowercase: true, default: null },
}, { _id: true });

// Charter-party history (owner 2026-10-27): append-only list of C/P dates with delivery/redelivery dates + prices
// (USD minor units). The newest entry drives charterStartDate / charterEndDate below.
const charterEntrySchema = new mongoose.Schema({
  charterPartyDate:     { type: Date, default: null },
  deliveryDate:         { type: Date, required: true },
  deliveryPriceMinor:   { type: Number, min: 0, validate: (v) => v == null || Number.isSafeInteger(v), default: null },
  redeliveryDate:       { type: Date, required: true },
  addedBy:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: true, timestamps: { createdAt: true, updatedAt: false } });

const vesselSchema = new mongoose.Schema(
  {
    vesselCode:            { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    vesselName:            { type: String, required: true, trim: true, maxlength: 100 },
    imoNumber:             { type: String, required: true, unique: true, trim: true },
    flag:                  { type: String, trim: true, default: null },
    callSign:              { type: String, trim: true, default: null },
    reeferPlugs:           { type: Number, min: 0, validate: (v) => v == null || Number.isInteger(v), default: null },
    particularsFileUrl:    { type: String, trim: true, default: null },   // vessel particulars PDF (authenticated download)
    particularsOriginalName: { type: String, trim: true, default: null },
    ownershipType:         { type: String, enum: OWNERSHIP_TYPES, required: true },
    ownerName:             { type: String, trim: true, default: null },
    ownershipDescription:  { type: String, trim: true, default: null, maxlength: 500 },
    charterStartDate:      { type: Date, default: null },
    charterEndDate:        { type: Date, default: null },
    ownerContacts:         { type: [ownerContactSchema], default: [] },
    charterHistory:        { type: [charterEntrySchema], default: [] },
    capacity:              { type: Number, min: 0, default: null },
    dwt:                   { type: Number, min: 0, default: null },
    builtYear:             { type: Number, min: 1800, max: new Date().getFullYear() + 1, default: null },

    // Vessel particulars — extended
    manager:               { type: String, trim: true, default: null },
    loa:                   { type: Number, min: 0, default: null },   // Length Overall (m)
    beam:                  { type: Number, min: 0, default: null },   // Beam (m)
    summerDraft:           { type: Number, min: 0, default: null },   // Summer Draft (m)
    grossTonnage:          { type: Number, min: 0, default: null },   // Gross Tonnage
    netTonnage:            { type: Number, min: 0, default: null },   // Net Tonnage
    suezGT:                { type: Number, min: 0, default: null },   // Suez Canal GT
    suezNT:                { type: Number, min: 0, default: null },   // Suez Canal NT

    // Bunker capacities (metric tonnes)
    totalBunkerCapacity:   { type: Number, min: 0, default: null },
    vlsfoCapacity:         { type: Number, min: 0, default: null },   // VLSFO (MT)
    mdoCapacity:           { type: Number, min: 0, default: null },   // MDO (MT)
    fwCapacity:            { type: Number, min: 0, default: null },   // Fresh Water Tank (MT)

    // C/P bunker consumption profile (all optional)
    mainEngineFuelType:    { type: String, trim: true, default: null, maxlength: 40 },
    auxEngineFuelType:     { type: String, trim: true, default: null, maxlength: 40 },
    consumptionSeaMtDay:         { type: Number, min: 0, default: null },
    consumptionPortIdleMtDay:    { type: Number, min: 0, default: null },
    consumptionPortWorkingMtDay: { type: Number, min: 0, default: null },

    // Financials: default daily charter cost in USD minor units (cents)
    defaultDailyHireRateMinor: { type: Number, min: 0, validate: Number.isSafeInteger, default: null },

    status:                { type: String, enum: VESSEL_STATUS, default: 'Active' },
    notes:                 { type: String, trim: true, default: null },
    createdBy:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// vesselCode and imoNumber uniqueness enforced inline
vesselSchema.index({ status: 1 });

module.exports = mongoose.model('Vessel', vesselSchema);
