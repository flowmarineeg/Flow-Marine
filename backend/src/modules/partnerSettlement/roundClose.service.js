'use strict';

const mongoose = require('mongoose');
const Round = require('../rounds/round.model');
const Voyage = require('../voyages/voyage.model');
const Expense = require('../expenses/expense.model');
const Invoice = require('../invoices/invoice.model');
const VesselPartner = require('../partners/vesselPartner.model');
const ledger = require('../ledger/ledger.service');
const JournalEntryLine = require('../ledger/journalEntryLine.model');
const AppError = require('../../utils/AppError');
const { BASE_CURRENCY } = require('../../utils/money');
const { recordMoneyEvent } = require('../../utils/moneyAudit');
const { PartnerSettlement, PartnerTransfer, JvReserveMovement } = require('./partnerSettlement.models');
const ps = require('./partnerSettlement.service');

const inTransaction = async (fn) => {
  const s = await mongoose.startSession();
  try { let out; await s.withTransaction(async () => { out = await fn(s); }); return out; } finally { s.endSession(); }
};

/**
 * S2 - close checklist. `blockers` stop the close (open PDAs can be overridden
 * with a reason); `warnings` are shown but do not stop it.
 */
const checklist = async (roundId, session = null, currency = BASE_CURRENCY) => {
  const round = await Round.findById(roundId).session(session).lean();
  if (!round) throw new AppError(404, 'Round not found', 'ROUND_NOT_FOUND');
  const voyages = await Voyage.find({ roundId }).select('status').session(session).lean();
  const voyageIds = voyages.map((v) => v._id);
  const scope = { $or: [{ roundId }, { voyageId: { $in: voyageIds } }] };

  const pdas = await Expense.find({ ...scope, kind: 'PDA' }).select('_id').session(session).lean();
  const finalised = pdas.length
    ? new Set((await Expense.find({ pdaExpenseId: { $in: pdas.map((p) => p._id) } }).select('pdaExpenseId').session(session).lean()).map((x) => String(x.pdaExpenseId)))
    : new Set();
  const openPdas = pdas.filter((p) => !finalised.has(String(p._id))).length;

  const draftInvoices = await Invoice.countDocuments({ v2: true, status: 'Draft', $or: [{ roundId }, { 'lineItems.roundId': roundId }] }).session(session);
  const openVoyages = voyages.filter((v) => !['Completed', 'Cancelled'].includes(v.status)).length;

  const blockers = [];
  if (openPdas) blockers.push({ code: 'ROUND_HAS_OPEN_PDA', count: openPdas, label: 'estimates (PDA) without a final (FDA)', overridable: true });
  if (draftInvoices) blockers.push({ code: 'ROUND_HAS_DRAFT_INVOICES', count: draftInvoices, label: 'draft invoices' });
  if (openVoyages) blockers.push({ code: 'ROUND_HAS_OPEN_VOYAGES', count: openVoyages, label: 'voyages not Completed or Cancelled' });

  if (!(await VesselPartner.exists({ vesselId: round.vesselId }))) {
    blockers.push({ code: 'NO_PARTNER_SHARES', count: 1, label: "vessel has no partner shares" });
  }

  // Settlement runs in one currency; lines in any other are left out of the profit, so the Round must not close (audit F-02).
  const otherCurrency = await JournalEntryLine.countDocuments({ roundId, currency: { $ne: currency } }).session(session);
  if (otherCurrency) blockers.push({ code: 'ROUND_HAS_OTHER_CURRENCY', count: otherCurrency, label: `ledger lines not in ${currency} (they would be left out of the profit)` });

  const warnings = [];
  const unposted = await Expense.countDocuments({ ...scope, kind: 'FDA', ledgerEntryId: null }).session(session);
  if (unposted) warnings.push({ code: 'UNPOSTED_EXPENSES', count: unposted, label: 'final expenses not posted to the ledger (they are not in the profit)' });
  const AgentSettlementStatement = mongoose.models.AgentSettlementStatement;
  if (AgentSettlementStatement) {
    const open = await AgentSettlementStatement.countDocuments({ roundId, status: { $ne: 'Settled' } }).session(session);
    if (open) warnings.push({ code: 'UNSETTLED_STATEMENTS', count: open, label: 'agent settlement statements not settled' });
  }
  return { roundId, closeStatus: round.closeStatus || 'Open', blockers, warnings, canClose: blockers.length === 0 };
};

const markReady = async (roundId, user) => {
  const cl = await checklist(roundId);
  if (!cl.canClose) throw new AppError(409, 'The Round still has items to resolve', 'ROUND_NOT_READY');
  const r = await Round.findOneAndUpdate({ _id: roundId, closeStatus: { $in: [null, 'Open'] } }, { $set: { closeStatus: 'ReadyToClose' } }, { new: true }).lean();
  if (!r) throw new AppError(409, 'Round is not Open', 'ROUND_NOT_OPEN');
  recordMoneyEvent({ user, module: 'rounds', event: 'round.ready', recordId: roundId });
  return r;
};

const close = async (roundId, data, user, { canOverride = false, canCarryForward = false } = {}) => {
  const carry = Number.isSafeInteger(data.carryForwardMinor) ? data.carryForwardMinor : 0;
  const reason = data.overrideReason ? String(data.overrideReason).trim() : '';
  const currency = String(data.currency || BASE_CURRENCY).toUpperCase();
  try {
    if (carry > 0 && !canCarryForward) throw new AppError(403, 'You may not carry profit forward', 'FORBIDDEN_CARRY');
    const out = await inTransaction(async (session) => {
      const claimed = await Round.findOneAndUpdate(
        { _id: roundId, closeStatus: { $ne: 'Closed' } },
        { $set: { closeStatus: 'Closed', closedAt: new Date(), closedBy: user._id, settlementMode: data.mode === 'Cash' ? 'Cash' : 'Accrual', carryForwardMinor: carry } },
        { new: true, session });
      if (!claimed) {
        const r = await Round.findById(roundId).session(session).lean();
        if (!r) throw new AppError(404, 'Round not found', 'ROUND_NOT_FOUND');
        throw new AppError(409, 'Round is already closed', 'ROUND_CLOSED');
      }
      const cl = await checklist(roundId, session, currency);
      const hard = cl.blockers.filter((b) => !b.overridable);
      if (hard.length) {
        const err = new AppError(409, `Cannot close: ${hard.map((b) => `${b.count} ${b.label}`).join(', ')}`, 'ROUND_NOT_READY');
        err.blockers = hard; throw err;
      }
      const pda = cl.blockers.find((b) => b.code === 'ROUND_HAS_OPEN_PDA');
      if (pda) {
        if (!canOverride) throw new AppError(409, `Cannot close: ${pda.count} ${pda.label}`, 'ROUND_HAS_OPEN_PDA');
        if (!reason) throw new AppError(400, 'A written reason is required to close with open estimates', 'OVERRIDE_REASON_REQUIRED');
      }

      const settlement = await ps.calculateInner(roundId, { mode: claimed.settlementMode, carryForwardMinor: carry, currency }, user._id, session);
      const entry = await ps.postClosingEntry(settlement, claimed, user._id, session);
      settlement.status = 'Final'; settlement.closingEntryId = entry?._id || null;
      await settlement.save({ session });
      if (carry > 0) {
        await JvReserveMovement.create([{ vesselId: claimed.vesselId, roundId, type: 'Hold', amountMinor: carry, currency, ledgerEntryId: entry?._id || null, createdBy: user._id }], { session });
      }
      return { round: claimed.toObject(), settlementId: settlement._id, overridden: !!pda, overrideReason: pda ? reason : null };
    });
    recordMoneyEvent({ user, module: 'rounds', event: out.overridden ? 'round.close.override' : 'round.close', recordId: roundId, after: { carryForwardMinor: carry }, reason: out.overrideReason });
    return out;
  } catch (e) {
    recordMoneyEvent({ user, module: 'rounds', event: 'round.close', recordId: roundId, success: false, error: `${e.code || ''} ${e.message}`.trim() });
    throw e;
  }
};

const reopen = async (roundId, reason, user) => {
  if (!reason || !String(reason).trim()) throw new AppError(400, 'A reason is required to reopen a Round', 'REASON_REQUIRED');
  try {
    const out = await inTransaction(async (session) => {
      const claimed = await Round.findOneAndUpdate(
        { _id: roundId, closeStatus: 'Closed' },
        { $set: { closeStatus: 'Open', reopenedAt: new Date(), reopenedBy: user._id, reopenReason: String(reason).trim(), carryForwardMinor: 0 } },
        { new: false, session });
      if (!claimed) throw new AppError(409, 'Round is not closed', 'ROUND_NOT_CLOSED');

      const st = await PartnerSettlement.findOne({ roundId }).session(session);
      if (st) {
        if (await PartnerTransfer.exists({ settlementId: st._id, status: 'Paid' }).session(session)) {
          throw new AppError(409, 'Reverse the paid partner transfers first', 'ROUND_HAS_PAID_TRANSFERS');
        }
        if (st.closingEntryId) {
          const holds = await JvReserveMovement.find({ roundId, type: 'Hold', status: 'Active' }).session(session);
          for (const h of holds) {
            const bal = await ps.reserveBalance(claimed.vesselId, h.currency, session);
            if (bal - h.amountMinor < 0) throw new AppError(409, 'The reserve held at close has already been used', 'RESERVE_ALREADY_USED');
          }
          await ledger.reverse(st.closingEntryId, `Round reopened: ${reason}`, { session, postedBy: user._id });
          await JvReserveMovement.updateMany({ roundId, type: 'Hold', status: 'Active' }, { $set: { status: 'Reversed' } }, { session });
        }
        st.status = 'Draft'; st.closingEntryId = null;
        await st.save({ session });
      }
      return { roundId };
    });
    recordMoneyEvent({ user, module: 'rounds', event: 'round.reopen', recordId: roundId, before: { closeStatus: 'Closed' }, after: { closeStatus: 'Open' }, reason });
    return out;
  } catch (e) {
    recordMoneyEvent({ user, module: 'rounds', event: 'round.reopen', recordId: roundId, success: false, reason, error: `${e.code || ''} ${e.message}`.trim() });
    throw e;
  }
};

module.exports = { checklist, markReady, close, reopen };
