'use strict';

const lock = require('../rounds/roundLock');
const mongoose = require('mongoose');
const Expense = require('./expense.model');
const ExpenseType = require('../expenseTypes/expenseType.model');
const Voyage = require('../voyages/voyage.model');
const ledger = require('../ledger/ledger.service');
const AppError = require('../../utils/AppError');
const { toMinor } = require('../../utils/money');
const { expenseAccountCode } = require('../agentAccounts/agentAccounts.logic');

const inTransaction = async (fn) => {
  const s = await mongoose.startSession();
  try { let out; await s.withTransaction(async () => { out = await fn(s); }); return out; } finally { s.endSession(); }
};
const isDup = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ''));

// Sprint052 E1 - paid-by consistency, used by create/update.
const checkPaidBy = ({ paidBy, paidByPartnerId, agentId }) => {
  if (!paidBy) return;
  if (paidBy === 'Partner' && !paidByPartnerId) throw { status: 400, message: 'Choose the partner who paid' };
  if (paidBy === 'PortAgent' && !agentId) throw { status: 400, message: 'A port-agent expense needs an agent' };
};

/** E2: convert an estimate (PDA) into its final (FDA) and report the variance. */
const convertToFda = async (pdaId, data, userId) => {
  await lock.assertExpenseRoundOpen(pdaId);
  const pda = await Expense.findById(pdaId).lean();
  if (!pda) throw new AppError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
  if (pda.kind !== 'PDA') throw new AppError(409, 'Only an estimate (PDA) can be converted', 'NOT_A_PDA');
  const amount = Number(data.amount);
  if (!(amount >= 0)) throw new AppError(400, 'Final amount is required', 'AMOUNT_INVALID');
  const currency = String(data.currency || pda.currency).toUpperCase();
  const paidBy = data.paidBy || pda.paidBy || null;
  const paidByPartnerId = data.paidByPartnerId || pda.paidByPartnerId || null;
  try { checkPaidBy({ paidBy, paidByPartnerId, agentId: pda.agentId }); } catch (e) { throw new AppError(e.status, e.message, 'PAID_BY_INVALID'); }

  try {
    const fda = await Expense.create({
      roundId: pda.roundId, voyageId: pda.voyageId, portId: pda.portId, expenseTypeId: pda.expenseTypeId,
      agentId: pda.agentId, port: pda.port, amount, currency,
      expenseDate: new Date(data.expenseDate || Date.now()), description: data.description || pda.description,
      kind: 'FDA', pdaExpenseId: pda._id, paidBy, paidByPartnerId, createdBy: userId, updatedBy: userId,
    });
    const varianceMinor = pda.currency === currency ? toMinor(amount, currency) - toMinor(pda.amount, currency) : null;
    return { fda: fda.toObject(), pdaAmount: pda.amount, varianceMinor };
  } catch (e) {
    if (isDup(e)) throw new AppError(409, 'This estimate already has a final (FDA) expense', 'PDA_ALREADY_CONVERTED');
    throw e;
  }
};

/** Post an FDA expense to the ledger (needs expenses:approve). */
const postExpense = async (id, userId) => {
  await lock.assertExpenseRoundOpen(id);
  return inTransaction(async (session) => {
    const claimed = await Expense.findOneAndUpdate(
      { _id: id, kind: 'FDA', ledgerEntryId: null, postedAt: null, paidBy: { $ne: null } },
      { $set: { postedAt: new Date(), updatedBy: userId } }, { new: true, session });
    if (!claimed) {
      const e = await Expense.findById(id).session(session).lean();
      if (!e) throw new AppError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
      if (e.kind === 'PDA') throw new AppError(409, 'An estimate (PDA) does not post - convert it to a final (FDA) first', 'PDA_NOT_POSTABLE');
      if (e.ledgerEntryId || e.postedAt) throw new AppError(409, 'Expense is already posted', 'EXPENSE_POSTED');
      if (!e.paidBy) throw new AppError(409, 'Set who paid before posting', 'PAID_BY_REQUIRED');
      throw new AppError(409, 'Expense cannot be posted', 'EXPENSE_NOT_POSTABLE');
    }
    if (!(claimed.amount > 0)) throw new AppError(400, 'Cannot post a zero expense', 'AMOUNT_INVALID');
    const type = await ExpenseType.findById(claimed.expenseTypeId).session(session).lean();
    let roundId = claimed.roundId;
    if (!roundId && claimed.voyageId) roundId = (await Voyage.findById(claimed.voyageId).select('roundId').session(session).lean())?.roundId || null;
    const amountMinor = toMinor(claimed.amount, claimed.currency);

    let credit;
    if (claimed.paidBy === 'PortAgent') {
      if (!claimed.agentId) throw new AppError(409, 'A port-agent expense needs an agent', 'PAID_BY_INVALID');
      credit = { accountCode: '2000', creditMinor: amountMinor, agentId: claimed.agentId };
    } else if (claimed.paidBy === 'Partner') {
      if (!claimed.paidByPartnerId) throw new AppError(409, 'Choose the partner who paid', 'PAID_BY_INVALID');
      credit = { accountCode: '1200', creditMinor: amountMinor, partnerId: claimed.paidByPartnerId };
    } else {
      credit = { accountCode: '1010', creditMinor: amountMinor };
    }
    const entry = await ledger.post({
      date: claimed.expenseDate, sourceType: 'Expense', sourceId: claimed._id, roundId,
      memo: `${type?.name || 'Expense'}${claimed.description ? ` - ${claimed.description}` : ''}`,
      currency: claimed.currency, postedBy: userId,
    }, [
      { accountCode: expenseAccountCode(type || {}), debitMinor: amountMinor, agentId: claimed.agentId, voyageId: claimed.voyageId },
      credit,
    ], { session });
    claimed.ledgerEntryId = entry._id;
    await claimed.save({ session });
    return claimed.toObject();
  });
};

/** Reverse a posted expense so it can be corrected (reason required). */
const reverseExpense = async (id, reason, userId) => {
  await lock.assertExpenseRoundOpen(id);
  if (!reason || !String(reason).trim()) throw new AppError(400, 'A reason is required', 'REASON_REQUIRED');
  return inTransaction(async (session) => {
    const e = await Expense.findById(id).session(session);
    if (!e) throw new AppError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
    if (!e.ledgerEntryId) throw new AppError(409, 'Expense is not posted', 'EXPENSE_NOT_POSTED');
    await ledger.reverse(e.ledgerEntryId, reason, { session, postedBy: userId });
    e.ledgerEntryId = null; e.postedAt = null; e.updatedBy = userId;
    await e.save({ session });
    return e.toObject();
  });
};

module.exports = { checkPaidBy, convertToFda, postExpense, reverseExpense };
