'use strict';

const mongoose = require('mongoose');

const terminalSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true, maxlength: 100 },
    portId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Port', required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

terminalSchema.index({ name: 1, portId: 1 }, { unique: true });
terminalSchema.index({ portId: 1 });
terminalSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Terminal', terminalSchema);
