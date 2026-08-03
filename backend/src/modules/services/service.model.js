'use strict';

const mongoose = require('mongoose');
const { SERVICE_STATUS } = require('../../config/constants');

const serviceSchema = new mongoose.Schema(
  {
    serviceCode:      { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    serviceName:      { type: String, required: true, trim: true, maxlength: 100 },
    defaultVesselId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', default: null },
    description:      { type: String, trim: true, default: null },
    status:           { type: String, enum: SERVICE_STATUS, default: 'Active' },
    createdBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// serviceCode uniqueness enforced inline
serviceSchema.index({ status: 1 });

module.exports = mongoose.model('Service', serviceSchema);
