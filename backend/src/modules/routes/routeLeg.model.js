'use strict';

const mongoose = require('mongoose');

const routeLegSchema = new mongoose.Schema(
  {
    routeId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Route',    required: true },
    sequence:   { type: Number, required: true, min: 1 },
    countryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Country',  required: true },
    cityId:     { type: mongoose.Schema.Types.ObjectId, ref: 'City',     required: true },
    portId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Port',     required: true },
    terminalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Terminal', default: null },
    agentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',    default: null },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',     default: null },
    updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',     default: null },
  },
  { timestamps: true }
);

routeLegSchema.index({ routeId: 1, sequence: 1 }, { unique: true });
routeLegSchema.index({ routeId: 1 });
routeLegSchema.index({ portId: 1 });

module.exports = mongoose.model('RouteLeg', routeLegSchema);
