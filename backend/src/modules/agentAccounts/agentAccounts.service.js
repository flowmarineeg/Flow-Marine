'use strict';

const lock = require('../rounds/roundLock');
const mongoose = require('mongoose');
const Agent = require('../agents/agent.model');
const Booking = require('../bookings/booking.model');
const Voyage = require('../voyages/voyage.model');
const Invoice = require('../invoices/invoice.model');
const AgentAgreement = require('../agreements/agentAgreement.model');
const Account = require('../ledger/account.model');
const JournalEntry = require('../ledger/journalEntry.model');
const JournalEntryLine = require('../ledger/journalEntryLine.model');
const ledger = require('../ledger/ledger.service');
const invoiceV2 = require('../billing/invoiceV2.service');
const AppError = require('../../utils/AppError');
const { BASE_CURRENCY } = require('../../utils/money');
const { HandlingCharge, OffsetBatch, AgentSettlementStatement } = require('./agentAccounts.models');
const L = require('./agentAccounts.logic');

const PAYABLE = ['Issued', 'Partially Paid', 'Overdue'];
const isDup = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ''));

const inTransaction = async (fn) => {
  const s = await mongoose.startSession();
  try { let out; await s.withTransaction(async () => { out = await fn(s); }); return out; } finally { s.endSession(); }
};

const loadAgent = async (agentId, { allowDirectLine = false } = {}) => {
  const agent = await Agent.findById(agentId).lean();
  if (!agent) throw new AppError(404, 'Agent not found', 'AGENT_NOT_FOUND');
  if (!allowDirectLine && agent.partyType === 'DirectLine') {
    throw new AppError(409, 'A Direct Line has invoices and a statement only', 'DIRECT_LINE_NO_OFFSET');
  }
  return agent;
};

// Audit H2: the payable check is a read followed by a write, so concurrent cash movements need a shared
// document to collide on. Touching the Agent inside the transaction makes them queue (one retries).
const lockAgent = (agentId, session) => Agent.updateOne({ _id: agentId }, { $inc: { ledgerVersion: 1 } }, { session });

const bankCode = (bank, method) => (bank?.type === 'Partner' ? '1200' : method === 'Cash' ? '1020' : '1010');
const bankOf = (b) => (b?.type === 'Partner'
  ? (() => { if (!b.partnerId) throw new AppError(400, 'partnerId is required for a partner bank', 'PARTNER_REQUIRED'); return { type: 'Partner', partnerId: b.partnerId }; })()
  : { type: 'Company' });
const positiveInt = (n) => {
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError(400, 'Amount must be a positive whole number of minor units', 'AMOUNT_INVALID');
  return n;
};

const accountIds = async (codes) => {
  const rows = await Account.find({ code: { $in: codes } }).lean();
  return Object.fromEntries(rows.map((a) => [a.code, a._id]));
};

// ─── Ledger reads ─────────────────────────────────────────────────────────────
/** Agent's lines on 1100/1110/2000 with the ORIGINAL source of each entry (reversals resolved). */
const agentLedgerLines = async ({ agentId, currency = BASE_CURRENCY, roundId = null, dateFrom, dateTo }, session = null) => {
  const ids = await accountIds(['1100', '1110', '2000']);
  const codeOf = Object.fromEntries(Object.entries(ids).map(([c, id]) => [String(id), c]));
  const q = { agentId, currency, accountId: { $in: Object.values(ids) } };
  if (roundId) q.roundId = roundId;
  if (dateFrom || dateTo) { q.date = {}; if (dateFrom) q.date.$gte = new Date(dateFrom); if (dateTo) q.date.$lte = new Date(dateTo); }
  const lines = await JournalEntryLine.find(q).session(session).lean();
  const entries = await JournalEntry.find({ _id: { $in: lines.map((l) => l.entryId) } }).session(session).lean();
  const entryById = new Map(entries.map((e) => [String(e._id), e]));
  const revIds = entries.filter((e) => e.reversesEntryId).map((e) => e.reversesEntryId);
  const originals = revIds.length ? await JournalEntry.find({ _id: { $in: revIds } }).session(session).lean() : [];
  const origById = new Map(originals.map((e) => [String(e._id), e]));
  return lines.map((l) => {
    const e = entryById.get(String(l.entryId));
    const orig = e?.reversesEntryId ? origById.get(String(e.reversesEntryId)) : null;
    return {
      ...l, accountCode: codeOf[String(l.accountId)], entryNumber: e?.entryNumber, memo: e?.memo,
      sourceType: (orig || e)?.sourceType, isReversal: !!e?.reversesEntryId,
    };
  });
};

/** What we owe the agent (credits - debits on 2000), optionally for one Round. */
const payableBalance = async ({ agentId, currency, roundId = null }, session = null) => {
  const ids = await accountIds(['2000']);
  const match = { agentId: new mongoose.Types.ObjectId(String(agentId)), currency, accountId: ids['2000'] };
  if (roundId) match.roundId = new mongoose.Types.ObjectId(String(roundId));
  const [r] = await JournalEntryLine.aggregate([
    { $match: match }, { $group: { _id: null, d: { $sum: '$debitMinor' }, c: { $sum: '$creditMinor' } } },
  ]).session(session);
  return r ? r.c - r.d : 0;
};

// ─── SOA (E4) - a QUERY over the ledger, no duplicate truth ──────────────────
const soa = async (agentId, { currency = BASE_CURRENCY, roundId = null, dateFrom, dateTo } = {}) => {
  await loadAgent(agentId, { allowDirectLine: true });
  const lines = await agentLedgerLines({ agentId, currency, roundId, dateFrom, dateTo });
  const { rows, closingMinor } = L.buildStatementRows(lines.map((l) => ({ ...l, date: l.date })));
  const invoices = await Invoice.find({ agentId, v2: true, docKind: { $in: ['Invoice', 'DebitNote'] }, currency, status: { $in: PAYABLE } }).lean();
  const open = invoices.map((i) => ({ id: i._id, number: i.invoiceNumber, dueDate: i.dueDate, balanceMinor: i.totalMinor - i.paidMinor - i.creditedMinor }));
  return {
    currency, rows, closingMinor,
    direction: closingMinor > 0 ? 'AgentOwesUs' : closingMinor < 0 ? 'WeOweAgent' : 'Even',
    openInvoices: open.filter((i) => i.balanceMinor > 0),
    ageing: L.ageingBuckets(open),
  };
};

// ─── Advances, return of advance, pay agent (E6) ─────────────────────────────
const advance = async (agentId, data, userId) => {
  const agent = await loadAgent(agentId);
  const amountMinor = positiveInt(data.amountMinor);
  const currency = String(data.currency || BASE_CURRENCY).toUpperCase();
  const bank = bankOf(data.bankAccount);
  return inTransaction(async (session) => {
    await lockAgent(agentId, session);
    return ledger.post({
      date: new Date(data.date || Date.now()), sourceType: 'Settlement', sourceId: agent._id, roundId: data.roundId || null,
      memo: `Advance to ${agent.agentName}${data.reference ? ` (${data.reference})` : ''}`, currency, postedBy: userId,
    }, [
      { accountCode: '1110', debitMinor: amountMinor, agentId: agent._id },
      { accountCode: bankCode(bank, data.method), creditMinor: amountMinor, partnerId: bank.partnerId || null },
    ], { session });
  });
};

const returnAdvance = async (agentId, data, userId) => {
  const agent = await loadAgent(agentId);
  const amountMinor = positiveInt(data.amountMinor);
  const currency = String(data.currency || BASE_CURRENCY).toUpperCase();
  const bank = bankOf(data.bankAccount);
  return inTransaction(async (session) => {
    await lockAgent(agentId, session);
    const lines = await agentLedgerLines({ agentId, currency }, session);
    const adv = lines.filter((l) => l.accountCode === '1110').reduce((a, l) => a + l.debitMinor - l.creditMinor, 0);
    if (amountMinor > adv) throw new AppError(409, 'Amount exceeds the advance outstanding', 'RETURN_EXCEEDS_ADVANCE');
    return ledger.post({
      date: new Date(data.date || Date.now()), sourceType: 'Settlement', sourceId: agent._id, roundId: data.roundId || null,
      memo: `Advance returned by ${agent.agentName}`, currency, postedBy: userId,
    }, [
      { accountCode: bankCode(bank, data.method), debitMinor: amountMinor, partnerId: bank.partnerId || null },
      { accountCode: '1110', creditMinor: amountMinor, agentId: agent._id },
    ], { session });
  });
};

const payAgent = async (agentId, data, userId) => {
  const agent = await loadAgent(agentId);
  const amountMinor = positiveInt(data.amountMinor);
  const currency = String(data.currency || BASE_CURRENCY).toUpperCase();
  const bank = bankOf(data.bankAccount);
  return inTransaction(async (session) => {
    await lockAgent(agentId, session);
    const payable = await payableBalance({ agentId, currency }, session);
    if (amountMinor > payable) throw new AppError(409, 'Amount exceeds what we owe this agent', 'PAYMENT_EXCEEDS_PAYABLE');
    return ledger.post({
      date: new Date(data.date || Date.now()), sourceType: 'Settlement', sourceId: agent._id, roundId: data.roundId || null,
      memo: `Payment to ${agent.agentName}${data.reference ? ` (${data.reference})` : ''}`, currency, postedBy: userId,
    }, [
      { accountCode: '2000', debitMinor: amountMinor, agentId: agent._id },
      { accountCode: bankCode(bank, data.method), creditMinor: amountMinor, partnerId: bank.partnerId || null },
    ], { session });
  });
};

// ─── Netting engine (E5) ─────────────────────────────────────────────────────
const offsetInner = async (agentId, { roundId, strategy, batchId, currency }, userId, session) => {
  await lockAgent(agentId, session);
  if (strategy === 'sameRound' && !roundId) throw new AppError(400, 'roundId is required for sameRound', 'ROUND_REQUIRED');
  const payable = await payableBalance({ agentId, currency, roundId: strategy === 'sameRound' ? roundId : null }, session);
  const invs = await Invoice.find({
    agentId, v2: true, docKind: { $in: ['Invoice', 'DebitNote'] }, currency, status: { $in: PAYABLE },
  }).session(session).lean();
  const closed = new Set(await lock.closedRoundIds()); // invoices of closed Rounds are skipped, not failed
  const open = invs.filter((i) => !closed.has(String(i.roundId || i.lineItems?.[0]?.roundId || ''))).map((i) => ({
    id: i._id, dueDate: i.dueDate, roundId: i.roundId || i.lineItems?.[0]?.roundId || null,
    balanceMinor: i.totalMinor - i.paidMinor - i.creditedMinor,
  }));
  const plan = L.allocateOffset(payable, open, { strategy, roundId });
  if (!plan.allocations.length) return { applied: false, appliedMinor: 0, payableMinor: payable, settlements: [] };

  await OffsetBatch.create([{ batchId, agentId, roundId: roundId || null, strategy, currency, appliedMinor: plan.appliedMinor, createdBy: userId }], { session });
  const done = [];
  for (const a of plan.allocations) {
    const st = await invoiceV2.recordSettlement(a.invoiceId, { amountMinor: a.amountMinor, date: new Date(), reference: batchId },
      userId, { session, kind: 'Offset' });
    done.push({ invoiceId: a.invoiceId, settlementId: st._id, amountMinor: a.amountMinor });
  }
  await OffsetBatch.updateOne({ batchId }, { $set: { settlements: done } }, { session });
  return { applied: true, appliedMinor: plan.appliedMinor, payableMinor: payable, settlements: done };
};

const offset = async (agentId, data, userId) => {
  await loadAgent(agentId);
  const { batchId } = data;
  if (!batchId || !String(batchId).trim()) throw new AppError(400, 'batchId is required', 'BATCH_REQUIRED');
  const params = {
    roundId: data.roundId || null, strategy: data.strategy === 'sameRound' ? 'sameRound' : 'oldest',
    batchId: String(batchId).trim(), currency: String(data.currency || BASE_CURRENCY).toUpperCase(),
  };
  const existing = await OffsetBatch.findOne({ batchId: params.batchId }).lean();
  if (existing) return { duplicate: true, batch: existing }; // double-click safe
  try {
    const r = await inTransaction((session) => offsetInner(agentId, params, userId, session));
    return { duplicate: false, ...r, batch: await OffsetBatch.findOne({ batchId: params.batchId }).lean() };
  } catch (e) {
    if (isDup(e)) return { duplicate: true, batch: await OffsetBatch.findOne({ batchId: params.batchId }).lean() };
    throw e;
  }
};

const reverseOffset = async (agentId, batchId, reason, userId) => {
  if (!reason || !String(reason).trim()) throw new AppError(400, 'A reason is required', 'REASON_REQUIRED');
  return inTransaction(async (session) => {
    const batch = await OffsetBatch.findOneAndUpdate(
      { batchId, agentId, status: 'Applied' },
      { $set: { status: 'Reversed', reversedAt: new Date(), reverseReason: String(reason).trim() } },
      { new: true, session }
    );
    if (!batch) throw new AppError(404, 'Applied batch not found (or already reversed)', 'BATCH_NOT_FOUND');
    for (const s of batch.settlements) {
      await invoiceV2.voidSettlement(s.invoiceId, s.settlementId, `Offset batch ${batchId} reversed: ${reason}`, userId, { session });
    }
    return batch.toObject();
  });
};

// ─── Handling charges (E7, D3-A) ─────────────────────────────────────────────
const handlingContext = async (agentId, roundId) => {
  const agreement = await AgentAgreement.findOne({
    agentId, status: 'Active', validFrom: { $lte: new Date() }, $or: [{ validTo: null }, { validTo: { $gte: new Date() } }],
  }).sort({ validFrom: -1 }).lean();
  if (!agreement) throw new AppError(409, 'No active agreement with handling fees for this agent', 'NO_AGREEMENT');
  const voyageIds = (await Voyage.find({ roundId }).select('_id').lean()).map((v) => v._id);
  const bookings = await Booking.find({ agentId, voyageId: { $in: voyageIds }, status: 'Final Loading' })
    .select('voyageId status dischargeStatus containerStatus').lean();
  const existing = await HandlingCharge.find({ bookingId: { $in: bookings.map((b) => b._id) }, status: 'Posted' }).select('bookingId moveType').lean();
  const keys = new Set(existing.map((c) => `${c.bookingId}|${c.moveType}`));
  const plan = L.planHandling(bookings, agreement.handlingFees || [], keys);
  return { agreement, plan };
};

const handlingPreview = async (agentId, roundId) => {
  await loadAgent(agentId);
  const { agreement, plan } = await handlingContext(agentId, roundId);
  return { currency: agreement.currency, ...plan };
};

const handlingConfirm = async (agentId, roundId, userId) => {
  await lock.assertRoundOpen(roundId);
  await loadAgent(agentId);
  return inTransaction(async (session) => {
    const { agreement, plan } = await handlingContext(agentId, roundId);
    if (!plan.charges.length) return { created: 0, totalMinor: 0, unpriced: plan.unpriced };
    const entry = await ledger.post({
      date: new Date(), sourceType: 'HandlingFee', sourceId: new mongoose.Types.ObjectId(String(agentId)), roundId,
      memo: `Handling fees (${plan.charges.length} moves)`, currency: agreement.currency, postedBy: userId,
    }, [
      { accountCode: '5300', debitMinor: plan.totalMinor, agentId },
      { accountCode: '2000', creditMinor: plan.totalMinor, agentId },
    ], { session });
    await HandlingCharge.insertMany(plan.charges.map((c) => ({
      ...c, agentId, roundId, currency: agreement.currency, ledgerEntryId: entry._id, createdBy: userId,
    })), { session });
    return { created: plan.charges.length, totalMinor: plan.totalMinor, unpriced: plan.unpriced, entryId: entry._id };
  }).catch((e) => {
    if (isDup(e)) throw new AppError(409, 'Some charges were just generated by another request', 'HANDLING_DUPLICATE');
    throw e;
  });
};

const listHandling = (agentId, roundId) =>
  HandlingCharge.find({ agentId, ...(roundId ? { roundId } : {}) }).sort({ createdAt: -1 }).limit(500).lean();

// ─── Final Settlement Statement (E8) ─────────────────────────────────────────
const computeStatement = async (agentId, roundId, currency, session = null) => {
  const lines = await agentLedgerLines({ agentId, currency, roundId }, session);
  return L.categorizeLines(lines);
};

const buildStatement = async (agentId, roundId, data, userId) => {
  await lock.assertRoundOpen(roundId);
  await loadAgent(agentId);
  const currency = String(data.currency || BASE_CURRENCY).toUpperCase();
  const calc = await computeStatement(agentId, roundId, currency);
  const cur = await AgentSettlementStatement.findOne({ agentId, roundId, currency });
  if (cur && cur.status !== 'Draft') throw new AppError(409, `Statement is ${cur.status} and can no longer be rebuilt`, 'STATEMENT_LOCKED');
  return AgentSettlementStatement.findOneAndUpdate(
    { agentId, roundId, currency },
    { $set: { lines: calc.lines, netMinor: calc.netMinor, direction: calc.direction, status: 'Draft' }, $setOnInsert: { createdBy: userId } },
    { upsert: true, new: true }
  ).lean();
};

const getStatement = async (agentId, roundId, currency = BASE_CURRENCY) => {
  await loadAgent(agentId, { allowDirectLine: true });
  return AgentSettlementStatement.findOne({ agentId, roundId, currency: String(currency).toUpperCase() }).lean();
};

const agreeStatement = async (id) => {
  const st = await AgentSettlementStatement.findOneAndUpdate({ _id: id, status: 'Draft' }, { $set: { status: 'Agreed', agreedAt: new Date() } }, { new: true }).lean();
  if (!st) throw new AppError(409, 'Only a Draft statement can be agreed', 'STATEMENT_NOT_DRAFT');
  return st;
};

const settleStatement = async (id, userId) => {
  const pre = await AgentSettlementStatement.findById(id).select('roundId').lean();
  if (pre) await lock.assertRoundOpen(pre.roundId);
  return inTransaction(async (session) => {
    const st = await AgentSettlementStatement.findOneAndUpdate(
      { _id: id, status: 'Agreed' }, { $set: { status: 'Settled', settledAt: new Date() } }, { new: true, session });
    if (!st) throw new AppError(409, 'Only an Agreed statement can be settled', 'STATEMENT_NOT_AGREED');
    await loadAgent(st.agentId);
    let batchId = `stmt-${st._id}`;
    {
      const r = await offsetInner(st.agentId, { roundId: st.roundId, strategy: 'sameRound', batchId, currency: st.currency }, userId, session);
      if (!r.applied) batchId = null;
    }
    const after = await computeStatement(st.agentId, st.roundId, st.currency, session);
    st.offsetBatchId = batchId;
    st.residualMinor = after.netMinor; // cash still to move: >0 agent pays us, <0 we pay agent
    await st.save({ session });
    return st.toObject();
  });
};

// ─── Agreements (E3) ─────────────────────────────────────────────────────────
const listAgreements = (agentId) => AgentAgreement.find({ agentId }).sort({ validFrom: -1 }).lean();
const saveAgreement = async (agentId, id, data, userId) => {
  await loadAgent(agentId, { allowDirectLine: true });
  const fields = {
    currency: String(data.currency || BASE_CURRENCY).toUpperCase(),
    validFrom: new Date(data.validFrom), validTo: data.validTo ? new Date(data.validTo) : null,
    handlingFees: data.handlingFees || [], commission: data.commission || { rule: null },
    husbandryFeePerCallMinor: Number.isSafeInteger(data.husbandryFeePerCallMinor) ? data.husbandryFeePerCallMinor : 0,
    status: data.status || 'Active',
  };
  // A commission rule without the flag would silently never accrue - default the flag from the rule, explicit wins.
  fields.earnsBookingCommission = typeof data.earnsBookingCommission === 'boolean' ? data.earnsBookingCommission : !!fields.commission?.rule;
  if (fields.earnsBookingCommission && !fields.commission?.rule) throw new AppError(400, 'Choose a commission rule or turn off "earns booking commission"', 'COMMISSION_RULE_REQUIRED');
  if (fields.validTo && fields.validTo < fields.validFrom) throw new AppError(400, 'validTo must be after validFrom', 'DATE_ORDER');
  if (id) {
    const a = await AgentAgreement.findOneAndUpdate({ _id: id, agentId }, { $set: fields }, { new: true, runValidators: true }).lean();
    if (!a) throw new AppError(404, 'Agreement not found', 'AGREEMENT_NOT_FOUND');
    return a;
  }
  return (await AgentAgreement.create({ ...fields, agentId, createdBy: userId })).toObject();
};
const deleteAgreement = async (agentId, id) => {
  const AgentCommission = require('../agreements/agentCommission.model');
  if (await AgentCommission.exists({ agreementId: id })) {
    throw new AppError(409, 'Agreement has accrued commissions - deactivate it instead', 'HAS_DEPENDENTS');
  }
  const r = await AgentAgreement.deleteOne({ _id: id, agentId });
  if (!r.deletedCount) throw new AppError(404, 'Agreement not found', 'AGREEMENT_NOT_FOUND');
};

// ─── Commission control (audit H7) ───────────────────────────────────────────
const listCommissions = async (agentId, { roundId, status } = {}) => {
  const AgentCommission = require('../agreements/agentCommission.model');
  const q = { agentId };
  if (roundId) q.roundId = roundId;
  if (status) q.status = status;
  return AgentCommission.find(q).populate('invoiceId', 'invoiceNumber status').populate('roundId', 'roundNumber').sort({ createdAt: -1 }).limit(500).lean();
};

/** Cancel an accrued commission: reverses its ledger entry (DR Agent Payable / CR Commission). */
const cancelCommissionTx = async (commissionId, reason, userId, session) => {
  const AgentCommission = require('../agreements/agentCommission.model');
  const row = await AgentCommission.findOneAndUpdate({ _id: commissionId, status: 'Accrued' }, { $set: { status: 'Cancelled' } }, { new: true, session });
  if (!row) throw new AppError(409, 'Only an accrued commission can be cancelled', 'COMMISSION_NOT_ACCRUED');
  if (row.ledgerEntryId) await ledger.reverse(row.ledgerEntryId, `Commission cancelled: ${reason}`, { session, postedBy: userId });
  return row;
};

const cancelCommission = async (commissionId, reason, user) => {
  if (!reason || !String(reason).trim()) throw new AppError(400, 'A reason is required', 'REASON_REQUIRED');
  const AgentCommission = require('../agreements/agentCommission.model');
  const pre = await AgentCommission.findById(commissionId).lean();
  if (!pre) throw new AppError(404, 'Commission not found', 'COMMISSION_NOT_FOUND');
  if (pre.roundId) await lock.assertRoundOpen(pre.roundId);
  try {
    const row = await inTransaction((session) => cancelCommissionTx(commissionId, String(reason).trim(), user._id, session));
    require('../../utils/moneyAudit').recordMoneyEvent({ user, module: 'agents', event: 'commission.cancel', recordId: row._id, before: { status: 'Accrued', amountMinor: row.amountMinor }, after: { status: 'Cancelled' }, reason });
    return row.toObject();
  } catch (e) {
    require('../../utils/moneyAudit').recordMoneyEvent({ user, module: 'agents', event: 'commission.cancel', recordId: commissionId, success: false, reason, error: `${e.code || ''} ${e.message}`.trim() });
    throw e;
  }
};

module.exports = {
  listCommissions, cancelCommission, cancelCommissionTx,
  soa, advance, returnAdvance, payAgent, offset, reverseOffset,
  handlingPreview, handlingConfirm, listHandling,
  buildStatement, getStatement, agreeStatement, settleStatement,
  listAgreements, saveAgreement, deleteAgreement, payableBalance,
};
