'use strict';

const mongoose = require('mongoose');
const { ROUND_STATUS } = require('../../config/constants');

// Route as it was when the round was created (RV-13/14). Later edits of the Service route never change it.
const snapshotLegSchema = new mongoose.Schema(
  {
    sequence:   { type: Number, required: true },
    countryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Country' },
    cityId:     { type: mongoose.Schema.Types.ObjectId, ref: 'City' },
    portId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Port' },
    terminalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Terminal', default: null },
    agentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
    portName:   { type: String, default: null },
    portCode:   { type: String, default: null },
  },
  { _id: false }
);

const roundSchema = new mongoose.Schema(
  {
    roundNumber:  { type: String, required: true, unique: true, trim: true },
    roundName:    { type: String, trim: true, default: null },
    serviceId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    vesselId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel',  required: true },
    startDate:    { type: Date, required: true },
    endDate:      { type: Date, required: true },
    status:       { type: String, enum: ROUND_STATUS, default: 'Planned' },
    notes:        { type: String, trim: true, default: null },
    voyageIds:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Voyage' }],
    // Absent on rounds created before 2026-10-26: readers fall back to the live Service route.
    routeSnapshot: {
      type: new mongoose.Schema(
        { routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' }, capturedAt: Date, legs: [snapshotLegSchema] },
        { _id: false }
      ),
      default: undefined,
    },
    // Monotonic voyage sequence allocator: a deleted voyage's number is never handed out again (RV-35).
    // Absent on older rounds; initialised lazily from max(sequence).
    lastVoyageSeq: { type: Number, min: 0 },
    // Sprint 053 V2 - financial closing axis. DIFFERENT from `status` (operational
    // Planned/Active/Completed/Cancelled), which is untouched. Old documents read as Open.
    v2:                { type: Boolean, default: false },   // created while the partners module was on -> its vessel's shares are locked (audit H1)
    lockVersion:       { type: Number, default: 0 },        // bumped by every ledger posting so a concurrent close conflicts (audit H4)
    closeStatus:       { type: String, enum: ['Open', 'ReadyToClose', 'Closed'], default: 'Open' },
    settlementMode:    { type: String, enum: ['Accrual', 'Cash'], default: 'Accrual' },
    carryForwardMinor: { type: Number, default: 0 },
    closedAt:          { type: Date, default: null },
    closedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reopenedAt:        { type: Date, default: null },
    reopenedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reopenReason:      { type: String, trim: true, default: null },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// roundNumber uniqueness enforced inline
roundSchema.index({ serviceId: 1 });
roundSchema.index({ vesselId: 1 });
roundSchema.index({ status: 1 });
roundSchema.index({ startDate: 1 });
// One Active round per vessel, enforced by the database (RV-07/RV-34). Build it with
// `npm run migrate:rounds-voyages`, which first reports any existing duplicate Active rounds.
roundSchema.index({ vesselId: 1 }, { unique: true, partialFilterExpression: { status: 'Active' }, name: 'one_active_round_per_vessel' });

module.exports = mongoose.model('Round', roundSchema);
