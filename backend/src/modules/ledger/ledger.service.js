'use strict';

const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const { nextNumber } = require('../../utils/autoNumber');
const { assertMinor } = require('../../utils/money');
const Account = require('./account.model');
const JournalEntry = require('./journalEntry.model');
const JournalEntryLine = require('./journalEntryLine.model');

/**
 * Pure validation (no DB), exported for unit tests.
 * R2: at least 2 lines; each line is debit XOR credit, integer minor units,
 * greater than zero; per currency sum(debit) === sum(credit).
 */
const assertBalanced = (lines, entryCurrency) => {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new AppError(400, 'A journal entry needs at least two lines', 'LEDGER_UNBALANCED');
  }
  const totals = new Map();
  for (const l of lines) {
    const d = l.debitMinor || 0;
    const c = l.creditMinor || 0;
    assertMinor(d);
    assertMinor(c);
    if (d < 0 || c < 0 || (d > 0) === (c > 0)) {
      throw new AppError(400, 'Each line must carry exactly one of debit or credit, greater than zero', 'LEDGER_BAD_LINE');
    }
    const cur = String(l.currency || entryCurrency).toUpperCase();
    const t = totals.get(cur) || { d: 0, c: 0 };
    t.d += d;
    t.c += c;
    totals.set(cur, t);
  }
  for (const [cur, t] of totals) {
    if (t.d !== t.c) {
      throw new AppError(400, `Entry is unbalanced in ${cur}: debit ${t.d} != credit ${t.c}`, 'LEDGER_UNBALANCED');
    }
  }
};

const inTransaction = async (session, fn) => {
  if (session) return fn(session);
  const s = await mongoose.startSession();
  try {
    let out;
    await s.withTransaction(async () => { out = await fn(s); });
    return out;
  } finally {
    s.endSession();
  }
};

/**
 * THE only way to write to the ledger (R2).
 * entry: { date, sourceType, sourceId?, roundId?, memo?, currency, fxRate?, postedBy? }
 * lines: [{ accountCode | accountId, debitMinor?, creditMinor?, currency?, partnerId?, agentId?, roundId?, voyageId? }]
 * opts.session: join the caller's transaction; otherwise one is opened here.
 */
const post = async (entry, lines, { session, allowClosed = false } = {}) => {
  if (!entry?.date || !entry?.sourceType || !entry?.currency) {
    throw new AppError(400, 'date, sourceType and currency are required', 'LEDGER_BAD_ENTRY');
  }
  const currency = String(entry.currency).toUpperCase();
  assertBalanced(lines, currency);

  return inTransaction(session, async (s) => {
    // Audit H4: closing entries and partner transfers pass allowClosed; everything else must find the Round open.
    if (entry.roundId && !allowClosed) await require('../rounds/roundLock').assertRoundOpenTx(entry.roundId, s);
    const codes = [...new Set(lines.filter((l) => l.accountCode).map((l) => l.accountCode))];
    const ids   = [...new Set(lines.filter((l) => l.accountId).map((l) => String(l.accountId)))];
    const accounts = await Account.find({ $or: [{ code: { $in: codes } }, { _id: { $in: ids } }] }).session(s).lean();
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const byId   = new Map(accounts.map((a) => [String(a._id), a]));

    const resolved = lines.map((l) => {
      const acc = l.accountCode ? byCode.get(l.accountCode) : byId.get(String(l.accountId));
      if (!acc) throw new AppError(400, `Unknown account ${l.accountCode || l.accountId}`, 'ACCOUNT_NOT_FOUND');
      if (!acc.isActive) throw new AppError(400, `Account ${acc.code} is inactive`, 'ACCOUNT_INACTIVE');
      return { ...l, accountId: acc._id };
    });

    const entryNumber = await nextNumber('journal');
    const [doc] = await JournalEntry.create([{
      entryNumber,
      date: entry.date,
      roundId: entry.roundId || null,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId || null,
      memo: entry.memo || null,
      currency,
      fxRate: entry.fxRate || 1,
      reversesEntryId: entry.reversesEntryId || null,
      reversalReason: entry.reversalReason || null,
      postedBy: entry.postedBy || null,
    }], { session: s });

    await JournalEntryLine.insertMany(resolved.map((l) => ({
      entryId: doc._id,
      accountId: l.accountId,
      debitMinor: l.debitMinor || 0,
      creditMinor: l.creditMinor || 0,
      currency: String(l.currency || currency).toUpperCase(),
      partnerId: l.partnerId || null,
      agentId: l.agentId || null,
      roundId: l.roundId || entry.roundId || null,
      voyageId: l.voyageId || null,
      date: entry.date,
    })), { session: s });

    return doc.toObject();
  });
};

/**
 * Reverse a posted entry by posting its mirror image as a NEW entry. The
 * original is never edited through Mongoose; only its `status` flag flips,
 * through the raw collection, inside the same transaction. A unique partial
 * index on reversesEntryId makes a double reversal impossible at DB level.
 */
const reverse = async (entryId, reason, { session, postedBy, allowClosed = false } = {}) => {
  if (!reason || !String(reason).trim()) throw new AppError(400, 'A reason is required to reverse an entry', 'REASON_REQUIRED');

  return inTransaction(session, async (s) => {
    const original = await JournalEntry.findById(entryId).session(s).lean();
    if (!original) throw new AppError(404, 'Journal entry not found', 'ENTRY_NOT_FOUND');
    if (original.status === 'Reversed' || original.reversesEntryId) {
      throw new AppError(409, 'Entry is already reversed (or is itself a reversal)', 'ENTRY_ALREADY_REVERSED');
    }
    const lines = await JournalEntryLine.find({ entryId }).session(s).lean();
    const mirror = lines.map((l) => ({
      accountId: l.accountId, currency: l.currency,
      debitMinor: l.creditMinor, creditMinor: l.debitMinor,
      partnerId: l.partnerId, agentId: l.agentId, roundId: l.roundId, voyageId: l.voyageId,
    }));
    const rev = await post({
      date: new Date(), sourceType: 'Reversal', sourceId: original._id, roundId: original.roundId,
      memo: `Reversal of ${original.entryNumber}: ${String(reason).trim()}`,
      currency: original.currency, fxRate: original.fxRate,
      reversesEntryId: original._id, reversalReason: String(reason).trim(), postedBy,
    }, mirror, { session: s, allowClosed });
    await JournalEntry.collection.updateOne({ _id: original._id }, { $set: { status: 'Reversed' } }, { session: s });
    return rev;
  });
};

/** Trial balance (P9): per account and currency, sums of debit and credit. */
const trialBalance = async ({ roundId, dateFrom, dateTo } = {}) => {
  const match = {};
  if (roundId) match.roundId = new mongoose.Types.ObjectId(roundId);
  if (dateFrom || dateTo) {
    match.date = {};
    if (dateFrom) match.date.$gte = new Date(dateFrom);
    if (dateTo)   match.date.$lte = new Date(dateTo);
  }
  const rows = await JournalEntryLine.aggregate([
    { $match: match },
    { $group: {
      _id: { accountId: '$accountId', currency: '$currency' },
      debitMinor: { $sum: '$debitMinor' }, creditMinor: { $sum: '$creditMinor' },
    } },
    { $lookup: { from: 'accounts', localField: '_id.accountId', foreignField: '_id', as: 'account' } },
    { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
    { $project: {
      _id: 0, accountId: '$_id.accountId', currency: '$_id.currency',
      code: '$account.code', name: '$account.name', type: '$account.type', debitMinor: 1, creditMinor: 1,
    } },
    { $sort: { code: 1, currency: 1 } },
  ]);
  const totals = {};
  for (const r of rows) {
    const t = totals[r.currency] || (totals[r.currency] = { debitMinor: 0, creditMinor: 0 });
    t.debitMinor += r.debitMinor;
    t.creditMinor += r.creditMinor;
  }
  const balanced = Object.values(totals).every((t) => t.debitMinor === t.creditMinor);
  return { rows, totals, balanced };
};

module.exports = { assertBalanced, post, reverse, trialBalance };
