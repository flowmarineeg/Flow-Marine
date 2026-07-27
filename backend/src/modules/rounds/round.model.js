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
    isDeleted:    { type: Boolean, default: false },
    deletedAt:    { type: Date, default: null },
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
roundSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Round', roundSchema);
