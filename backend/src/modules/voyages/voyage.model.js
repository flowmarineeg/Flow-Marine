'use strict';

const mongoose = require('mongoose');
const { VOYAGE_STATUS } = require('../../config/constants');

const voyageSchema = new mongoose.Schema(
  {
    voyageNumber: { type: String, required: true, unique: true, trim: true },
    voyageCode:   { type: String, trim: true, default: null, maxlength: 50 },
    roundId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Round',   required: true },
    serviceId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    polId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Port',    required: true },
    podId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Port',    required: true },
    sequence:     { type: Number, required: true, min: 1 },
    etd:          { type: Date, default: null },
    eta:          { type: Date, default: null },
    etp:          { type: Date, default: null },
    atd:          { type: Date, default: null },
    ata:          { type: Date, default: null },
    status:       { type: String, enum: VOYAGE_STATUS, default: 'Scheduled' },
    isManual:     { type: Boolean, default: false },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// ── Compound indexes — Sprint020 DB-001 ───────────────────────────────────────
voyageSchema.index({ roundId: 1, sequence: 1 });       // round detail page loads
voyageSchema.index({ roundId: 1, status: 1 });         // status-filtered round views
voyageSchema.index({ serviceId: 1, status: 1, etd: 1 }); // report aggregations
voyageSchema.index({ status: 1, etd: 1 });             // active voyage queries
voyageSchema.index({ isManual: 1 });

module.exports = mongoose.model('Voyage', voyageSchema);
