'use strict';

const mongoose = require('mongoose');
const { ROUND_STATUS } = require('../../config/constants');

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

module.exports = mongoose.model('Round', roundSchema);
