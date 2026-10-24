'use strict';

const mongoose = require('mongoose');
const oid = (ref, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref, default: null, ...extra });

// E7 - handling fee owed to an agent for one container move. Idempotent per (booking, move).
const handlingChargeSchema = new mongoose.Schema(
  {
    agentId:         oid('Agent', { required: true }),
    roundId:         oid('Round', { required: true }),
    voyageId:        oid('Voyage'),
    bookingId:       oid('Booking', { required: true }),
    moveType:        { type: String, enum: ['Load', 'Discharge'], required: true },
    containerStatus: { type: String, enum: ['Full', 'Empty'], required: true },
    amountMinor:     { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    currency:        { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    status:          { type: String, enum: ['Posted', 'Reversed'], default: 'Posted' },
    ledgerEntryId:   oid('JournalEntry'),
    createdBy:       oid('User'),
  },
  { timestamps: true }
);
handlingChargeSchema.index({ bookingId: 1, moveType: 1 }, { unique: true });
handlingChargeSchema.index({ agentId: 1, roundId: 1 });

// E5 - one row per netting run; the unique batchId makes a double click a no-op.
const offsetBatchSchema = new mongoose.Schema(
  {
    batchId:       { type: String, required: true, unique: true, trim: true },
    agentId:       oid('Agent', { required: true }),
    roundId:       oid('Round'),
    strategy:      { type: String, enum: ['oldest', 'sameRound'], required: true },
    currency:      { type: String, required: true, uppercase: true },
    appliedMinor:  { type: Number, default: 0 },
    settlements:   [{ invoiceId: oid('Invoice'), settlementId: oid('InvoiceSettlement'), amountMinor: Number }],
    status:        { type: String, enum: ['Applied', 'Reversed'], default: 'Applied' },
    reversedAt:    { type: Date, default: null },
    reverseReason: { type: String, default: null },
    createdBy:     oid('User'),
  },
  { timestamps: true }
);

// E8 - Final Settlement Statement per agent per Round. Lines are a snapshot.
const statementSchema = new mongoose.Schema(
  {
    agentId:     oid('Agent', { required: true }),
    roundId:     oid('Round', { required: true }),
    currency:    { type: String, required: true, uppercase: true },
    lines:       [{ kind: String, amountMinor: Number, _id: false }],
    netMinor:    { type: Number, required: true },
    direction:   { type: String, enum: ['AgentPaysUs', 'WePayAgent', 'Even'] },
    status:      { type: String, enum: ['Draft', 'Agreed', 'Settled'], default: 'Draft' },
    agreedAt:    { type: Date, default: null },
    settledAt:   { type: Date, default: null },
    offsetBatchId: { type: String, default: null },
    residualMinor: { type: Number, default: null }, // what is still to be paid in cash after the offset
    createdBy:   oid('User'),
  },
  { timestamps: true }
);
// One statement per agent per round per currency.
statementSchema.index({ agentId: 1, roundId: 1, currency: 1 }, { unique: true });

module.exports = {
  HandlingCharge: mongoose.model('HandlingCharge', handlingChargeSchema),
  OffsetBatch: mongoose.model('OffsetBatch', offsetBatchSchema),
  AgentSettlementStatement: mongoose.model('AgentSettlementStatement', statementSchema),
};
