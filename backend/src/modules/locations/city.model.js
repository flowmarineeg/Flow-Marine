'use strict';

const mongoose = require('mongoose');

const citySchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true, maxlength: 100 },
    countryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

citySchema.index({ name: 1, countryId: 1 }, { unique: true });
citySchema.index({ countryId: 1 });

module.exports = mongoose.model('City', citySchema);
