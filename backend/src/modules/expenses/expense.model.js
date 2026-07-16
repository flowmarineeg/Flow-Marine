'use strict';

const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    roundId:                { type: mongoose.Schema.Types.ObjectId, ref: 'Round',       default: null },
    voyageId:               { type: mongoose.Schema.Types.ObjectId, ref: 'Voyage',      default: null },
    expenseTypeId:          { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseType', required: true },
    agentId:                { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',       default: null },
    port:                   { type: String, trim: true, default: null },
    amount:                 { type: Number, required: true, min: 0 },
    currency:               { type: String, required: true, trim: true, uppercase: true, maxlength: 10 },
    expenseDate:            { type: Date,   required: true },
    description:            { type: String, trim: true, default: null },
    attachmentUrl:          { type: String, trim: true, default: null },
    attachmentOriginalName: { type: String, trim: true, default: null },
    createdBy:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

expenseSchema.index({ roundId: 1 });
expenseSchema.index({ voyageId: 1 });
expenseSchema.index({ expenseTypeId: 1 });
expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ currency: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
