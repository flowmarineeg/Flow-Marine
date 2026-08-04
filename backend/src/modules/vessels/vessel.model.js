'use strict';

const mongoose = require('mongoose');
const { VESSEL_STATUS, OWNERSHIP_TYPES } = require('../../config/constants');

const vesselSchema = new mongoose.Schema(
  {
    vesselCode:            { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    vesselName:            { type: String, required: true, trim: true, maxlength: 100 },
    imoNumber:             { type: String, required: true, unique: true, trim: true },
    flag:                  { type: String, trim: true, default: null },
    callSign:              { type: String, trim: true, default: null },
    ownershipType:         { type: String, enum: OWNERSHIP_TYPES, required: true },
    ownerName:             { type: String, trim: true, default: null },
    ownershipDescription:  { type: String, trim: true, default: null, maxlength: 500 },
    charterStartDate:      { type: Date, default: null },
    charterEndDate:        { type: Date, default: null },
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
