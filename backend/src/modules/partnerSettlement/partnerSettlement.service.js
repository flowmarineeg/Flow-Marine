'use strict';

const mongoose = require('mongoose');
const Round = require('../rounds/round.model');
const Expense = require('../expenses/expense.model');
const VesselPartner = require('../partners/vesselPartner.model');
const Account = require('../ledger/account.model');
const JournalEntry = require('../ledger/journalEntry.model');
const JournalEntryLine = require('../ledger/journalEntryLine.model');
const ledger = require('../ledger/ledger.service');
const AppError = require('../../utils/AppError');
const { toMinor, BASE_CURRENCY } = require('../../utils/money');
const { recordMoneyEvent } = require('../../utils/moneyAudit');
const { assertRoundOpen, assertExpenseRoundOpen } = require('../rounds/roundLock');
const { PartnerSettlement, PartnerTransfer, JvReserveMovement } = require('./partnerSettlement.models');
const L = require('./partnerSettlement.logic');

const inTransaction = async (fn) => {
  const s = await mongoose.startSession();
  try { let out; await s.withTransaction(async () => { out = await fn(s); }); return out; } finally { s.endSession(); }
};

/** All of a Round's ledger lines with account code and the ORIGINAL source (reversals resolved). */
const roundLines = async (roundId, currency, session = null) => {
  const lines = await JournalEntryLine.find({ roundId, currency }).session(session).lean();
  const accounts = await Account.find({}).session(session).lean();
  const codeOf = new Map(accounts.map((a) => [String(a._id), a.code]));
  const entries = await JournalEntry.find({ _id: { $in: [...new Set(lines.map((l) => String(l.entryId)))] } }).session(session).lean();
  const eById = new Map(entries.map((e) => [String(e._id), e]));
  const revIds = entries.filter((e) => e.reversesEntryId).map((e) => e.reversesEntryId);
  const originals = revIds.length ? await JournalEntry.find({ _id: { $in: revIds } }).session(session).lean() : [];
  const oById = new Map(originals.map((e) => [String(e._id), e]));
  return lines.map((l) => {
    const e = eById.get(String(l.entryId));
    const o = e?.reversesEntryId ? oById.get(String(e.reversesEntryId)) : null;
    return { ...l, accountCode: codeOf.get(String(l.accountId)), sourceType: (o || e)?.sourceType };
  });
};

const directMovements = (lines) => {
  const paid = {}; const coll = {};
  for (const l of lines) {
    if (l.accountCode !== '1200' || !l.partnerId) continue;
    const pid = String(l.partnerId);
    if (l.sourceType === 'Expense') paid[pid] = (paid[pid] || 0) + (l.creditMinor - l.debitMinor);
    else if (l.sourceType === 'Settlement') coll[pid] = (coll[pid] || 0) + (l.debitMinor - l.creditMinor);
  }
  return { paid, coll };
};

// ─── Calculate (Draft) ───────────────────────────────────────────────────────
const calculateInner = async (roundId, { mode, carryForwardMinor = 0, currency = BASE_CURRENCY }, userId, session) => {
  const round = await Round.findById(roundId).session(session).lean();
  if (!round) throw new AppError(404, 'Round not found', 'ROUND_NOT_FOUND');
  const shares = await VesselPartner.find({ vesselId: round.vesselId }).session(session).lean();
  if (!shares.length) throw new AppError(409, "This vessel has no partner shares - set them on the vessel first", 'NO_PARTNER_SHARES');

  const lines = await roundLines(roundId, currency, session);
  const { paid, coll } = directMovements(lines);
  let res;
  try {
    res = L.settleRound({
      lines, mode: mode || round.settlementMode || 'Accrual',
      shares: shares.map((s) => ({ partnerId: s.partnerId, shareBp: s.shareBp })),
      paidDirect: paid, collectedDirect: coll, carryMinor: carryForwardMinor,
    });
  } catch (e) {
    if (e instanceof RangeError) throw new AppError(400, e.message, 'CARRY_INVALID');
    throw e;
  }
  const doc = await PartnerSettlement.findOneAndUpdate(
    { roundId, currency },
    {
      $set: {
        vesselId: round.vesselId, mode: mode || round.settlementMode || 'Accrual',
        revenueMinor: res.revenueMinor, expenseMinor: res.expenseMinor, profitMinor: res.profitMinor,
        carryForwardMinor: res.carryForwardMinor, distributableMinor: res.distributableMinor,
        outstandingReceivableMinor: res.outstandingReceivableMinor, outstandingPayableMinor: res.outstandingPayableMinor,
        partners: res.positions.map((p) => ({ partnerId: p.partnerId, shareBp: p.shareBp, shareMinor: p.shareMinor, paidDirectMinor: p.paidDirectMinor, collectedDirectMinor: p.collectedDirectMinor, netMinor: p.netMinor })),
        heldMinor: res.held, status: 'Draft',
      },
      $setOnInsert: { createdBy: userId },
    },
    { upsert: true, new: true, session }
  );
  await PartnerTransfer.deleteMany({ settlementId: doc._id, status: 'Suggested' }, { session });
  if (res.transfers.length) {
    await PartnerTransfer.insertMany(res.transfers.map((t) => ({ ...t, settlementId: doc._id, roundId, currency, createdBy: userId })), { session });
  }
  return doc;
};

const calculate = async (roundId, data, user) => {
  await assertRoundOpen(roundId);
  const currency = String(data.currency || BASE_CURRENCY).toUpperCase();
  const carryForwardMinor = Number.isSafeInteger(data.carryForwardMinor) ? data.carryForwardMinor : 0;
  const doc = await inTransaction((s) => calculateInner(roundId, { mode: data.mode, carryForwardMinor, currency }, user._id, s));
  return getSettlement(roundId, currency, doc);
};

const getSettlement = async (roundId, currency = BASE_CURRENCY, known = null) => {
  const settlement = known?.toObject ? known.toObject() : (known || await PartnerSettlement.findOne({ roundId, currency: String(currency).toUpperCase() }).lean());
  if (!settlement) return null;
  const [transfers] = await Promise.all([PartnerTransfer.find({ settlementId: settlement._id }).sort({ amountMinor: -1 }).lean()]);
  const Partner = mongoose.model('Partner');
  const ids = [...new Set([...settlement.partners.map((p) => String(p.partnerId)), ...transfers.flatMap((t) => [String(t.fromPartnerId), String(t.toPartnerId)])])];
  const names = Object.fromEntries((await Partner.find({ _id: { $in: ids } }).select('code name').lean()).map((p) => [String(p._id), p]));
  return {
    ...settlement,
    partners: settlement.partners.map((p) => ({ ...p, partner: names[String(p.partnerId)] || null })),
    transfers: transfers.map((t) => ({ ...t, from: names[String(t.fromPartnerId)] || null, to: names[String(t.toPartnerId)] || null })),
  };
};

// ─── Closing entry (called inside the Round close transaction) ───────────────
const postClosingEntry = async (settlement, round, userId, session) => {
  const cur = settlement.currency;
  const lines = [];
  for (const p of settlement.partners) {
    if (p.shareMinor > 0) lines.push({ accountCode: '1200', creditMinor: p.shareMinor, partnerId: p.partnerId });
    else if (p.shareMinor < 0) lines.push({ accountCode: '1200', debitMinor: -p.shareMinor, partnerId: p.partnerId });
  }
  if (settlement.carryForwardMinor > 0) lines.push({ accountCode: '2200', creditMinor: settlement.carryForwardMinor });
  const dr = lines.reduce((a, l) => a + (l.debitMinor || 0), 0);
  const cr = lines.reduce((a, l) => a + (l.creditMinor || 0), 0);
  if (dr === cr) return null; // nothing to distribute (profit 0 and no carry)
  lines.push(cr > dr ? { accountCode: '3000', debitMinor: cr - dr } : { accountCode: '3000', creditMinor: dr - cr });
  return ledger.post({
    date: new Date(), sourceType: 'Round', sourceId: round._id, roundId: round._id,
    memo: `Round ${round.roundNumber} closed - profit shared`, currency: cur, postedBy: userId,
  }, lines, { session, allowClosed: true }); // the closing entry is posted by the close itself
};

// ─── Transfers between partners ──────────────────────────────────────────────
const payTransfer = async (transferId, data, user) => {
  const t = await inTransaction(async (session) => {
    const claimed = await PartnerTransfer.findOneAndUpdate(
      { _id: transferId, status: 'Suggested' },
      { $set: { status: 'Paid', paidAt: new Date(data.date || Date.now()), reference: data.reference || null } },
      { new: true, session });
    if (!claimed) throw new AppError(409, 'Transfer is not awaiting payment', 'TRANSFER_NOT_SUGGESTED');
    const st = await PartnerSettlement.findById(claimed.settlementId).session(session).lean();
    if (st.status !== 'Final') throw new AppError(409, 'Close the Round before paying transfers', 'TRANSFER_NOT_FINAL');
    // payer's debt to the JV falls (CR), receiver's credit with the JV falls (DR)
    const entry = await ledger.post({
      date: claimed.paidAt, sourceType: 'PartnerSettlement', sourceId: claimed._id, roundId: claimed.roundId,
      memo: `Partner transfer${claimed.reference ? ` (${claimed.reference})` : ''}`, currency: claimed.currency, postedBy: user._id,
    }, [
      { accountCode: '1200', debitMinor: claimed.amountMinor, partnerId: claimed.toPartnerId },
      { accountCode: '1200', creditMinor: claimed.amountMinor, partnerId: claimed.fromPartnerId },
    ], { session, allowClosed: true }); // transfers are paid AFTER the Round is closed
    claimed.ledgerEntryId = entry._id;
    await claimed.save({ session });
    return claimed.toObject();
  });
  recordMoneyEvent({ user, module: 'partners', event: 'transfer.paid', recordId: t._id, after: { amountMinor: t.amountMinor, reference: t.reference } });
  return t;
};

const unpayTransfer = async (transferId, reason, user) => {
  if (!reason || !String(reason).trim()) throw new AppError(400, 'A reason is required', 'REASON_REQUIRED');
  const t = await inTransaction(async (session) => {
    const claimed = await PartnerTransfer.findOneAndUpdate({ _id: transferId, status: 'Paid' }, { $set: { status: 'Suggested', paidAt: null } }, { new: false, session });
    if (!claimed) throw new AppError(409, 'Transfer is not paid', 'TRANSFER_NOT_PAID');
    await ledger.reverse(claimed.ledgerEntryId, `Transfer reversed: ${reason}`, { session, postedBy: user._id, allowClosed: true });
    await PartnerTransfer.updateOne({ _id: transferId }, { $set: { ledgerEntryId: null } }, { session });
    return claimed.toObject();
  });
  recordMoneyEvent({ user, module: 'partners', event: 'transfer.unpaid', recordId: t._id, before: { status: 'Paid' }, reason });
  return t;
};

// ─── JV reserve (S4) ─────────────────────────────────────────────────────────
const reserveBalance = async (vesselId, currency = BASE_CURRENCY, session = null) => {
  const rows = await JvReserveMovement.aggregate([
    { $match: { vesselId: new mongoose.Types.ObjectId(String(vesselId)), currency, status: 'Active' } },
    { $group: { _id: '$type', total: { $sum: '$amountMinor' } } },
  ]).session(session);
  const g = Object.fromEntries(rows.map((r) => [r._id, r.total]));
  return (g.Hold || 0) - (g.Use || 0);
};

const listReserve = async (vesselId) => ({
  balances: { USD: await reserveBalance(vesselId, 'USD') },
  movements: await JvReserveMovement.find({ vesselId }).sort({ createdAt: -1 }).limit(100).populate('roundId', 'roundNumber').lean(),
});

const useReserve = async ({ expenseId, amountMinor }, user) => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new AppError(400, 'Amount must be a positive whole number of minor units', 'AMOUNT_INVALID');
  await assertExpenseRoundOpen(expenseId);
  const out = await inTransaction(async (session) => {
    const e = await Expense.findById(expenseId).session(session);
    if (!e) throw new AppError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
    if (e.kind !== 'FDA') throw new AppError(409, 'Only a final (FDA) expense can be funded from the reserve', 'NOT_AN_FDA');
    if (e.fundedFromReserve) throw new AppError(409, 'Expense is already funded from the reserve', 'ALREADY_FUNDED');
    let roundId = e.roundId;
    if (!roundId && e.voyageId) roundId = (await mongoose.model('Voyage').findById(e.voyageId).select('roundId').session(session).lean())?.roundId;
    const round = await Round.findById(roundId).session(session).lean();
    if (!round) throw new AppError(409, 'Expense has no Round', 'ROUND_REQUIRED');
    if (amountMinor > toMinor(e.amount, e.currency)) throw new AppError(409, 'Amount exceeds the expense', 'AMOUNT_EXCEEDS_EXPENSE');
    const bal = await reserveBalance(round.vesselId, e.currency, session);
    if (amountMinor > bal) throw new AppError(409, `Reserve balance is only ${bal}`, 'RESERVE_INSUFFICIENT');

    const entry = await ledger.post({
      date: new Date(), sourceType: 'Round', sourceId: e._id, roundId, memo: `Reserve used for expense`, currency: e.currency, postedBy: user._id,
    }, [{ accountCode: '2200', debitMinor: amountMinor }, { accountCode: '3000', creditMinor: amountMinor }], { session });
    await JvReserveMovement.create([{ vesselId: round.vesselId, roundId, type: 'Use', amountMinor, currency: e.currency, linkedExpenseId: e._id, ledgerEntryId: entry._id, createdBy: user._id }], { session });
    e.fundedFromReserve = true; e.updatedBy = user._id;
    await e.save({ session });
    return { expenseId: e._id, amountMinor, balanceAfterMinor: bal - amountMinor };
  });
  recordMoneyEvent({ user, module: 'ledger', event: 'reserve.use', recordId: expenseId, after: out });
  return out;
};

module.exports = {
  roundLines, calculate, calculateInner, getSettlement, postClosingEntry,
  payTransfer, unpayTransfer, reserveBalance, listReserve, useReserve,
};
