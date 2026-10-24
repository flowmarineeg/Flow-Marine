'use strict';

const mongoose = require('mongoose');

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

const accountSchema = new mongoose.Schema(
  {
    code:     { type: String, required: true, unique: true, trim: true, match: /^\d{4}$/ },
    name:     { type: String, required: true, trim: true, maxlength: 100 },
    type:     { type: String, enum: ACCOUNT_TYPES, required: true },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Account', accountSchema);
module.exports.ACCOUNT_TYPES = ACCOUNT_TYPES;
