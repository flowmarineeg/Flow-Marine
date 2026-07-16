'use strict';

const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, unique: true },
    name:      { type: String, trim: true, default: null },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// serviceId uniqueness enforced inline
routeSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Route', routeSchema);
