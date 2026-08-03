'use strict';

const mongoose = require('mongoose');

const expenseTypeSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    category:  { type: String, required: true, trim: true, maxlength: 50 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// name uniqueness enforced inline
expenseTypeSchema.index({ category: 1 });

module.exports = mongoose.model('ExpenseType', expenseTypeSchema);
