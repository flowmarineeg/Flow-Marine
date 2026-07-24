'use strict';

const mongoose = require('mongoose');
const { EXPENSE_COST_CLASSIFICATIONS } = require('../../config/constants');

/**
 * Standalone category collection.
 * Categories are created here independently — ExpenseTypes then pick from them.
 * Also, whenever a new ExpenseType is created with a new category string,
 * that category is auto-upserted here for future use.
 *
 * Sprint 035: costClassification is the business-configurable flag the
 * Voyage Profitability report (getRoundPnL) uses to decide whether every
 * expense under this category counts as Voyage Cost or Other Voyage Cost.
 * The report NEVER hardcodes a category name to make this decision —
 * only this field, settable by the business through the existing category
 * management UI, without any code change.
 */
const expenseCategorySchema = new mongoose.Schema(
  {
    name:               { type: String, required: true, unique: true, trim: true, maxlength: 50 },
    costClassification: { type: String, enum: EXPENSE_COST_CLASSIFICATIONS, default: 'Other Voyage Cost' },
    createdBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);
