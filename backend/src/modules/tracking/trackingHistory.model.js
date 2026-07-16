'use strict';

const mongoose = require('mongoose');
const { TRACKING_STATUS } = require('../../config/constants');

const trackingHistorySchema = new mongoose.Schema(
  {
    voyageId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Voyage',   required: true },
    roundId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Round',    required: true },
    vesselId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel',   required: true },
    serviceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Service',  required: true },
    countryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Country',  default: null },
    cityId:     { type: mongoose.Schema.Types.ObjectId, ref: 'City',     default: null },
    portId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Port',     required: true },
    terminalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Terminal', default: null },
    status:     { type: String, enum: TRACKING_STATUS, required: true },
    remarks:    { type: String, trim: true, default: null },
    lastUpdate: { type: Date, required: true },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  // updatedAt intentionally omitted — records are immutable
  { timestamps: { createdAt: true, updatedAt: false } }
);

trackingHistorySchema.index({ voyageId: 1, lastUpdate: -1 });
trackingHistorySchema.index({ roundId: 1 });
trackingHistorySchema.index({ vesselId: 1 });
trackingHistorySchema.index({ lastUpdate: -1 });

module.exports = mongoose.model('TrackingHistory', trackingHistorySchema);
