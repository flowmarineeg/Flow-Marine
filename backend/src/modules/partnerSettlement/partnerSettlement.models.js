'use strict';

const mongoose = require('mongoose');
const oid = (ref, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref, default: null, ...extra });

const partnerLine = new mongoose.Schema({
  partnerId: oid('Partner', { required: true }),
  shareBp: Number, shareMinor: Number, paidDirectMinor: Number, collectedDirectMinor: Number, netMinor: Number,
}, { _id: false });

// S3 - one settlement per Round (per currency). Draft until the Round closes.
const partnerSettlementSchema = new mongoose.Schema(
  {
    roundId:  oid('Round', { required: true }),
    vesselId: oid('Vessel', { required: true }),
    currency: { type: String, required: true, uppercase: true },
    mode:     { type: String, enum: ['Accrual', 'Cash'], default: 'Accrual' },
    revenueMinor: Number, expenseMinor: Number, profitMinor: Number,
    carryForwardMinor: { type: Number, default: 0 },
    distributableMinor: Number,
    outstandingReceivableMinor: Number, outstandingPayableMinor: Number,
    partners: [partnerLine],
    heldMinor: [{ partnerId: oid('Partner'), heldMinor: Number, _id: false }],
    status:   { type: String, enum: ['Draft', 'Final'], default: 'Draft' },
    closingEntryId: oid('JournalEntry'),
    createdBy: oid('User'),
  },
  { timestamps: true }
);
partnerSettlementSchema.index({ roundId: 1, currency: 1 }, { unique: true });

const partnerTransferSchema = new mongoose.Schema(
  {
    settlementId:  oid('PartnerSettlement', { required: true }),
    roundId:       oid('Round', { required: true }),
    fromPartnerId: oid('Partner', { required: true }),
    toPartnerId:   oid('Partner', { required: true }),
    amountMinor:   { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency:      { type: String, required: true, uppercase: true },
    status:        { type: String, enum: ['Suggested', 'Paid'], default: 'Suggested' },
    paidAt:        { type: Date, default: null },
    reference:     { type: String, trim: true, default: null },
    ledgerEntryId: oid('JournalEntry'),
    createdBy:     oid('User'),
  },
  { timestamps: true }
);
partnerTransferSchema.index({ settlementId: 1 });
partnerTransferSchema.index({ fromPartnerId: 1 });
partnerTransferSchema.index({ toPartnerId: 1 });

// S4 - JV reserve. Hold = carry forward at close; Use = funds an expense.
const jvReserveMovementSchema = new mongoose.Schema(
  {
    vesselId:   oid('Vessel', { required: true }),
    roundId:    oid('Round', { required: true }),
    type:       { type: String, enum: ['Hold', 'Use'], required: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency:   { type: String, required: true, uppercase: true },
    linkedExpenseId: oid('Expense'),
    status:     { type: String, enum: ['Active', 'Reversed'], default: 'Active' },
    ledgerEntryId: oid('JournalEntry'),
    createdBy:  oid('User'),
  },
  { timestamps: true }
);
jvReserveMovementSchema.index({ vesselId: 1, status: 1 });
jvReserveMovementSchema.index({ roundId: 1 });

module.exports = {
  PartnerSettlement: mongoose.model('PartnerSettlement', partnerSettlementSchema),
  PartnerTransfer: mongoose.model('PartnerTransfer', partnerTransferSchema),
  JvReserveMovement: mongoose.model('JvReserveMovement', jvReserveMovementSchema),
};
