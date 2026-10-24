'use strict';

const mongoose = require('mongoose');

// Sprint050 P4 — rate = units of `to` per 1 unit of `from` on `date`.
const exchangeRateSchema = new mongoose.Schema(
  {
    date:      { type: Date, required: true },
    from:      { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    to:        { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    rate:      { type: Number, required: true, min: 0 },
    source:    { type: String, trim: true, default: 'manual' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

exchangeRateSchema.index({ from: 1, to: 1, date: -1 }, { unique: true });

module.exports = mongoose.model('ExchangeRate', exchangeRateSchema);
