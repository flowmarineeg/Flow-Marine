'use strict';

const mongoose = require('mongoose');
const { VOYAGE_STATUS, VOYAGE_DIRECTION } = require('../../config/constants');

// Ports of the run in travel order (snapshot taken when the voyage is created or refreshed).
const portCallSchema = new mongoose.Schema(
  {
    legKey:   { type: String, required: true },
    portId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Port', required: true },
    portName: { type: String, default: null },
    portCode: { type: String, default: null },
    eta:      { type: Date, default: null },
    etd:      { type: Date, default: null },
  },
  { _id: false }
);

const voyageSchema = new mongoose.Schema(
  {
    voyageNumber: { type: String, required: true, unique: true, trim: true },
    voyageCode:   { type: String, trim: true, default: null, maxlength: 50 },
    voyageName:   { type: String, trim: true, default: null },
    roundId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Round',   required: true },
    serviceId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    polId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Port',    required: true },
    podId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Port',    required: true },
    sequence:     { type: Number, required: true, min: 1 },
    // polId/podId = first/last port call, kept so bookings, reports and invoices read the voyage unchanged.
    direction:    { type: String, enum: VOYAGE_DIRECTION, default: null },
    fromLegKey:   { type: String, default: null },
    toLegKey:     { type: String, default: null },
    portCalls:    { type: [portCallSchema], default: [] },
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
