'use strict';

const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true, maxlength: 100 },
    code:      { type: String, required: true, trim: true, uppercase: true, minlength: 2, maxlength: 2 },
    localCurrency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: null }, // ISO 4217, e.g. EGP
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

countrySchema.index({ name: 1 }, { unique: true });
countrySchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('Country', countrySchema);
