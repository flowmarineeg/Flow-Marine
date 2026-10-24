'use strict';

const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    roundId:                { type: mongoose.Schema.Types.ObjectId, ref: 'Round',       default: null },
    voyageId:               { type: mongoose.Schema.Types.ObjectId, ref: 'Voyage',      default: null },
    // Sprint 036 — Port Expense scope. Set together with voyageId (never
    // alone) when this expense applies to one specific port of that
    // voyage rather than the whole voyage. Scope itself is NEVER stored
    // as a separate field — it is always inferred from which of
    // roundId/voyageId/portId are present (see expense.service.js#deriveScope)
    // so an inconsistent state (e.g. portId set with no voyageId) is
    // rejected at write time instead of being representable at rest.
    portId:                 { type: mongoose.Schema.Types.ObjectId, ref: 'Port',        default: null },
    expenseTypeId:          { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseType', required: true },
    agentId:                { type: mongoose.Schema.Types.ObjectId, ref: 'Agent',       default: null },
    // Legacy free-text port field — kept for historical/display purposes
    // only. Port-scoped expenses created from Sprint 036 onward use
    // portId instead; this field is no longer written by that flow.
    port:                   { type: String, trim: true, default: null },
    amount:                 { type: Number, required: true, min: 0 },
    currency:               { type: String, required: true, trim: true, uppercase: true, maxlength: 10 },
    expenseDate:            { type: Date,   required: true },
    description:            { type: String, trim: true, default: null },
    attachmentUrl:          { type: String, trim: true, default: null },
    attachmentOriginalName: { type: String, trim: true, default: null },
    // ── Sprint 052 V2 (additive; an old expense reads as FDA, paidBy null) ──────
    kind:                   { type: String, enum: ['PDA', 'FDA'], default: 'FDA' },
    pdaExpenseId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', default: null }, // the estimate this FDA finalises
    paidBy:                 { type: String, enum: ['PortAgent', 'Company', 'Partner', null], default: null },
    paidByPartnerId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
    fundedFromReserve:      { type: Boolean, default: false }, // used by Sprint 053 reserve
    ledgerEntryId:          { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    postedAt:               { type: Date, default: null },
    createdBy:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

expenseSchema.index({ roundId: 1 });
expenseSchema.index({ voyageId: 1, portId: 1 });
expenseSchema.index({ expenseTypeId: 1 });
expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ currency: 1 });
// One FDA per PDA, enforced by the database.
expenseSchema.index({ pdaExpenseId: 1 }, { unique: true, partialFilterExpression: { pdaExpenseId: { $type: 'objectId' } } });

module.exports = mongoose.model('Expense', expenseSchema);
