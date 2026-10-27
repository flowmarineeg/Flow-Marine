'use strict';

const mongoose = require('mongoose');

// Sprint050 P6 — a vessel's JV share table. Shares are integer basis points
// (10000 = 100%), never floats.
const vesselPartnerSchema = new mongoose.Schema(
  {
    vesselId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', required: true },
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    shareBp:   { type: Number, required: true, min: 1, max: 10000, validate: Number.isInteger },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

vesselPartnerSchema.index({ vesselId: 1, partnerId: 1 }, { unique: true });
vesselPartnerSchema.index({ partnerId: 1 });

module.exports = mongoose.model('VesselPartner', vesselPartnerSchema);
