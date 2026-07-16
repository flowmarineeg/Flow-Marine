'use strict';

const mongoose = require('mongoose');

const portSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true, maxlength: 100 },
    code:      { type: String, trim: true, uppercase: true, default: null }, // UNLOCODE, optional
    cityId:    { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    countryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

portSchema.index({ name: 1, cityId: 1 }, { unique: true });
portSchema.index({ cityId: 1 });
portSchema.index({ countryId: 1 });
portSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Port', portSchema);
