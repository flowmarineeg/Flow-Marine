'use strict';

const mongoose = require('mongoose');

/**
 * Standalone category collection.
 * Categories are created here independently — ExpenseTypes then pick from them.
 * Also, whenever a new ExpenseType is created with a new category string,
 * that category is auto-upserted here for future use.
 */
const expenseCategorySchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, unique: true, trim: true, maxlength: 50 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);
