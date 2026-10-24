'use strict';

const mongoose = require('mongoose');
const { makeImmutable } = require('./immutable');

const oid = (ref) => ({ type: mongoose.Schema.Types.ObjectId, ref, default: null });

const journalEntryLineSchema = new mongoose.Schema(
  {
    entryId:     { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', required: true, index: true },
    accountId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    debitMinor:  { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    creditMinor: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    currency:    { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    partnerId:   oid('Partner'),
    agentId:     oid('Agent'),
    roundId:     oid('Round'),
    voyageId:    oid('Voyage'),
    date:        { type: Date, required: true }, // copied from the entry for range queries
  },
  { timestamps: false }
);

journalEntryLineSchema.index({ roundId: 1, accountId: 1 });
journalEntryLineSchema.index({ agentId: 1, accountId: 1 });
journalEntryLineSchema.index({ partnerId: 1, accountId: 1 });
journalEntryLineSchema.index({ accountId: 1, date: 1 });

makeImmutable(journalEntryLineSchema);

module.exports = mongoose.model('JournalEntryLine', journalEntryLineSchema);
