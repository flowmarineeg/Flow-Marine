'use strict';

const mongoose = require('mongoose');
const { makeImmutable } = require('./immutable');

const SOURCE_TYPES = [
  'Invoice', 'Settlement', 'Expense', 'Commission', 'HandlingFee',
  'PartnerSettlement', 'Round', 'Opening', 'Manual', 'Reversal',
];

const journalEntrySchema = new mongoose.Schema(
  {
    entryNumber:     { type: String, required: true, unique: true },
    date:            { type: Date, required: true },
    roundId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Round', default: null },
    sourceType:      { type: String, enum: SOURCE_TYPES, required: true },
    sourceId:        { type: mongoose.Schema.Types.ObjectId, default: null },
    memo:            { type: String, trim: true, default: null, maxlength: 500 },
    currency:        { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    fxRate:          { type: Number, default: 1 }, // snapshot: entry currency -> base
    status:          { type: String, enum: ['Posted', 'Reversed'], default: 'Posted' },
    reversesEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    reversalReason:  { type: String, trim: true, default: null },
    postedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

journalEntrySchema.index({ sourceType: 1, sourceId: 1 });
journalEntrySchema.index({ roundId: 1, date: 1 });
// DB-level guarantee that an entry can be reversed at most once.
journalEntrySchema.index(
  { reversesEntryId: 1 },
  { unique: true, partialFilterExpression: { reversesEntryId: { $type: 'objectId' } } }
);

makeImmutable(journalEntrySchema);

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
module.exports.SOURCE_TYPES = SOURCE_TYPES;
