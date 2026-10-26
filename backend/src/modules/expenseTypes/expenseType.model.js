'use strict';

const mongoose = require('mongoose');

const expenseTypeSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    category:  { type: String, required: true, trim: true, maxlength: 50 }, // business grouping; drives the P&L cost classification
    // Master data 11.7: where the cost belongs and which accounts it uses. Never stores an amount.
    operationalLevel: { type: String, enum: ['ROUND_LEVEL', 'VOYAGE_LEVEL', 'PORT_LEVEL'], default: 'VOYAGE_LEVEL' },
    requiresPda:      { type: Boolean, default: false },
    expenseAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null }, // required on save by the service layer
    accrualAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null }, // required when requiresPda
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// name uniqueness enforced inline
expenseTypeSchema.index({ category: 1 });

module.exports = mongoose.model('ExpenseType', expenseTypeSchema);
