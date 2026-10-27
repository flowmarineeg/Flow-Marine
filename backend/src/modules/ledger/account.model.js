'use strict';

const mongoose = require('mongoose');

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
const SUBLEDGER_TYPES = ['NONE', 'BANK', 'CASH', 'COMMERCIAL_CLIENT', 'PORT_AGENT', 'VESSEL', 'VENDOR', 'JV_PARTNER'];
const ALLOCATION_LEVELS = ['NONE', 'CORPORATE', 'ROUND_LEVEL', 'VOYAGE_LEVEL'];
const DIMENSIONS = ['round_id', 'voyage_id', 'client_id', 'port_agent_id', 'port_id', 'vessel_id', 'partner_id'];

// code: the 4-digit codes are the ledger's posting accounts; the 6-digit codes (docs/accounting chart) are
// master data only until the ledger moves to them (later money sprint).
const accountSchema = new mongoose.Schema(
  {
    code:     { type: String, required: true, unique: true, trim: true, match: /^(\d{4}|\d{6})$/ },
    name:     { type: String, required: true, trim: true, maxlength: 120 },
    nameAr:   { type: String, trim: true, default: null, maxlength: 120 },
    type:     { type: String, enum: ACCOUNT_TYPES, required: true },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
    // 6-digit chart attributes (all optional so the legacy 4-digit rows stay valid)
    level:          { type: Number, min: 1, max: 4, default: null },
    normalBalance:  { type: String, enum: ['DEBIT', 'CREDIT'], default: null },
    isGroup:        { type: Boolean, default: false },   // header accounts reject entries
    isPosting:      { type: Boolean, default: true },
    subledgerType:  { type: String, enum: SUBLEDGER_TYPES, default: 'NONE' },
    allocationLevel:{ type: String, enum: ALLOCATION_LEVELS, default: 'NONE' },
    requiredDimensions: { type: [{ type: String, enum: DIMENSIONS }], default: [] },
    defaultCurrency:{ type: String, trim: true, uppercase: true, maxlength: 3, default: null },
    isSystemLocked: { type: Boolean, default: false },   // locked rows cannot be edited from the Accounting tab
  },
  { timestamps: true }
);

module.exports = mongoose.model('Account', accountSchema);
module.exports.ACCOUNT_TYPES = ACCOUNT_TYPES;
module.exports.SUBLEDGER_TYPES = SUBLEDGER_TYPES;
module.exports.ALLOCATION_LEVELS = ALLOCATION_LEVELS;
module.exports.DIMENSIONS = DIMENSIONS;
