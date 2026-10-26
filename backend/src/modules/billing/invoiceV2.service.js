'use strict';

const lock = require('../rounds/roundLock');
const mongoose = require('mongoose');
const Invoice = require('../invoices/invoice.model');
const Booking = require('../bookings/booking.model');
const Voyage = require('../voyages/voyage.model');
const Round = require('../rounds/round.model');
const AgentCommission = require('../agreements/agentCommission.model');
const AgentAgreement = require('../agreements/agentAgreement.model');
const ledger = require('../ledger/ledger.service');
const fx = require('../ledger/fx.service');
const AppError = require('../../utils/AppError');
const { nextNumber } = require('../../utils/autoNumber');
const { toMinor, fromMinor, BASE_CURRENCY } = require('../../utils/money');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');
const { BookingItem, InvoiceLine, InvoiceSettlement } = require('./billing.models');
const { syncForVoyages } = require('./bookingItem.service');
const L = require('./billing.logic');

const major = (minor, cur) => Number(fromMinor(minor, cur));
const PAYABLE = ['Issued', 'Partially Paid', 'Overdue'];

const inTransaction = async (fn) => {
  const s = await mongoose.startSession();
  try {
    let out;
    await s.withTransaction(async () => { out = await fn(s); });
    return out;
  } finally { s.endSession(); }
};

const isDup = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ''));

// Re-derive money-driven status and keep the legacy float fields in step so
// V1 lists/PDF keep showing sensible numbers for V2 documents.
const recalc = async (invoiceId, session) => {
  const inv = await Invoice.findById(invoiceId).session(session);
  if (!inv) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  if (inv.docKind !== 'CreditNote') inv.status = L.deriveStatus(inv);
  inv.totalAmount = major(inv.totalMinor, inv.currency);
  inv.paidAmount = major(inv.paidMinor, inv.currency);
  await inv.save({ session });
  return inv;
};

/** Lazy Overdue (D16): present an open, past-due V2 invoice as Overdue on read. */
const presentInvoice = (inv) => {
  if (!inv || !inv.v2) return inv;
  const s = L.deriveStatus(inv);
  return s === inv.status ? inv : { ...inv, status: s };
};

// ─── Draft ────────────────────────────────────────────────────────────────────
// Booking freight rates carry no currency (they are base-currency amounts), so an invoice in another currency
// would only relabel the number. Until bookings carry a currency, invoices are base-currency only (audit F-03).
const assertInvoiceCurrency = (currency) => {
  if (currency !== BASE_CURRENCY) {
    throw new AppError(400, `Invoices can only be raised in ${BASE_CURRENCY} - booking freight rates are ${BASE_CURRENCY} amounts`, 'INVOICE_CURRENCY_UNSUPPORTED');
  }
};

const createDraft = async (data, userId) => {
  await lock.assertItemsRoundOpen(data.itemIds);
  const { invoiceType, billToAgentId, voyageId, roundId, itemIds, invoiceDate, dueDate, notes } = data;
  const currency = String(data.currency || BASE_CURRENCY).toUpperCase();
  assertInvoiceCurrency(currency);

  if (!Array.isArray(itemIds) || !itemIds.length) throw new AppError(400, 'Select at least one item', 'NO_ITEMS');
  if (invoiceType === 'Voyage' && !voyageId) throw new AppError(400, 'voyageId is required for a Voyage invoice', 'SCOPE_REQUIRED');
  if (invoiceType === 'Round' && !roundId) throw new AppError(400, 'roundId is required for a Round invoice', 'SCOPE_REQUIRED');
  if (new Date(dueDate) < new Date(invoiceDate)) throw new AppError(400, 'Due date must be on or after invoice date', 'DATE_ORDER');

  let scopeVoyages;
  if (invoiceType === 'Round') scopeVoyages = (await Voyage.find({ roundId }).select('_id').lean()).map((v) => String(v._id));
  else if (invoiceType === 'Voyage') scopeVoyages = [String(voyageId)];
  else scopeVoyages = null;

  // Refresh items from the live Final Loading bookings first (no stale qty).
  const probe = await BookingItem.find({ _id: { $in: itemIds } }).select('voyageId').lean();
  await syncForVoyages(probe.map((i) => i.voyageId));
  const items = await BookingItem.find({ _id: { $in: itemIds } }).populate('containerTypeId', 'code size').lean();

  if (items.length !== itemIds.length) throw new AppError(409, 'An item changed or disappeared - reload and try again', 'ITEM_CHANGED');
  for (const it of items) {
    if (it.locked) throw new AppError(409, 'An item is already on another invoice', 'DUPLICATE_BILLING');
    if (String(it.billToAgentId) !== String(billToAgentId)) throw new AppError(400, 'Item does not belong to the selected bill-to party', 'ITEM_PARTY_MISMATCH');
    if (scopeVoyages && !scopeVoyages.includes(String(it.voyageId))) throw new AppError(400, 'Item is outside the selected scope', 'ITEM_OUT_OF_SCOPE');
    if (!it.loadedQty) throw new AppError(400, 'Nothing has been Final Loaded for this item', 'NOT_FINAL_LOADED');
  }
  if (invoiceType === 'Booking' && items.reduce((a, i) => a + i.loadedQty, 0) !== 1) {
    throw new AppError(400, 'A Booking invoice covers exactly one booking', 'BOOKING_SCOPE');
  }

  const bookingIds = items.flatMap((i) => i.bookingIds);
  const bookings = await Booking.find({ _id: { $in: bookingIds }, status: 'Final Loading' }).lean();
  if (bookings.length !== bookingIds.length) throw new AppError(409, 'Bookings changed - reload and try again', 'ITEM_CHANGED');
  const lineItems = await Promise.all(bookings.map((b) => buildLineItemSnapshot(b)));
  const lines = items.map((it) => ({ it, ...L.buildLine(it, currency) }));
  const totalMinor = L.sumMinor(lines);

  try {
    return await inTransaction(async (session) => {
      const invoiceNumber = await nextNumber('invoice');
      const [inv] = await Invoice.create([{
        invoiceNumber, invoiceType, agentId: billToAgentId,
        voyageId: invoiceType === 'Voyage' ? voyageId : null,
        roundId: invoiceType === 'Round' ? roundId : null,
        lineItems, invoiceDate: new Date(invoiceDate), dueDate: new Date(dueDate), currency,
        totalAmount: major(totalMinor, currency), paidAmount: 0, status: 'Draft', notes: notes || null,
        v2: true, docKind: 'Invoice', totalMinor, paidMinor: 0, creditedMinor: 0,
        createdBy: userId, updatedBy: userId,
      }], { session });

      for (const l of lines) {
        const [line] = await InvoiceLine.create([{
          invoiceId: inv._id, bookingItemId: l.it._id, qty: l.qty, priceMinor: l.priceMinor,
          amountMinor: l.amountMinor, currency,
          snapshot: {
            roundNumber: lineItems.find((x) => String(x.voyageId) === String(l.it.voyageId))?.roundNumber || null,
            voyageLabel: lineItems.find((x) => String(x.voyageId) === String(l.it.voyageId))?.voyageName
              || lineItems.find((x) => String(x.voyageId) === String(l.it.voyageId))?.voyageNumber || null,
            containerType: l.it.containerTypeId ? `${l.it.containerTypeId.code} ${l.it.containerTypeId.size}` : null,
            freightRate: l.it.freightRate,
          },
        }], { session });
        const claimed = await BookingItem.updateOne(
          { _id: l.it._id, locked: false },
          { $set: { locked: true, invoiceLineId: line._id } },
          { session }
        );
        if (claimed.modifiedCount !== 1) throw new AppError(409, 'An item is already on another invoice', 'DUPLICATE_BILLING');
      }
      return inv.toObject();
    });
  } catch (e) {
    if (isDup(e)) throw new AppError(409, 'An item is already on another invoice', 'DUPLICATE_BILLING');
    throw e;
  }
};

const updateDraft = async (id, data, userId) => {
  await lock.assertInvoiceRoundOpen(id);
  const inv = await Invoice.findById(id);
  if (!inv || !inv.v2) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  if (inv.status !== 'Draft') throw new AppError(409, 'Only a Draft invoice can be edited - issued invoices are locked', 'INVOICE_LOCKED');
  if (data.invoiceDate) inv.invoiceDate = new Date(data.invoiceDate);
  if (data.dueDate) inv.dueDate = new Date(data.dueDate);
  if (inv.dueDate < inv.invoiceDate) throw new AppError(400, 'Due date must be on or after invoice date', 'DATE_ORDER');
  if (data.notes !== undefined) inv.notes = data.notes || null;
  if (data.currency && String(data.currency).toUpperCase() !== inv.currency) {
    const cur = String(data.currency).toUpperCase();
    assertInvoiceCurrency(cur);
    const lines = await InvoiceLine.find({ invoiceId: id });
    let total = 0;
    for (const ln of lines) {
      const priceMinor = toMinor(ln.snapshot.freightRate, cur);
      ln.priceMinor = priceMinor; ln.amountMinor = ln.qty * priceMinor; ln.currency = cur;
      total += ln.amountMinor;
      await ln.save();
    }
    inv.currency = cur; inv.totalMinor = total; inv.totalAmount = major(total, cur);
  }
  inv.updatedBy = userId;
  await inv.save();
  return inv.toObject();
};

// Draft delete: free the items, remove the lines, remove the invoice.
const deleteDraft = async (inv) => {
  await lock.assertInvoiceRoundOpen(inv._id);
  if (inv.status !== 'Draft') {
    throw new AppError(409, 'An issued invoice cannot be deleted - cancel it instead', 'INVOICE_POSTED');
  }
  await inTransaction(async (session) => {
    const lines = await InvoiceLine.find({ invoiceId: inv._id }).session(session);
    await BookingItem.updateMany({ _id: { $in: lines.map((l) => l.bookingItemId) } }, { $set: { locked: false, invoiceLineId: null } }, { session });
    await InvoiceLine.deleteMany({ invoiceId: inv._id }, { session });
    await Invoice.deleteOne({ _id: inv._id }, { session });
  });
};

// ─── Issue ────────────────────────────────────────────────────────────────────
const issue = async (id, userId) => {
  await lock.assertInvoiceRoundOpen(id);
  return inTransaction(async (session) => {
    const claimed = await Invoice.findOneAndUpdate(
      { _id: id, v2: true, docKind: 'Invoice', status: 'Draft' },
      { $set: { status: 'Issued', issuedAt: new Date(), issuedBy: userId, updatedBy: userId } },
      { new: true, session }
    );
    if (!claimed) {
      const cur = await Invoice.findById(id).session(session).lean();
      if (!cur || !cur.v2) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
      throw new AppError(409, `Invoice is ${cur.status}, not Draft`, 'INVOICE_NOT_DRAFT');
    }
    if (!(claimed.totalMinor > 0)) throw new AppError(400, 'Cannot issue a zero-value invoice', 'INVOICE_ZERO');

    let rate = 1;
    if (claimed.currency !== BASE_CURRENCY) {
      rate = await fx.getRate(claimed.currency, claimed.invoiceDate);
    }
    const roundId = claimed.roundId || claimed.lineItems[0]?.roundId || null;
    const entry = await ledger.post({
      date: claimed.invoiceDate, sourceType: 'Invoice', sourceId: claimed._id, roundId,
      memo: `Invoice ${claimed.invoiceNumber}`, currency: claimed.currency, fxRate: rate, postedBy: userId,
    }, [
      { accountCode: '1100', debitMinor: claimed.totalMinor, agentId: claimed.agentId, voyageId: claimed.voyageId },
      { accountCode: '4000', creditMinor: claimed.totalMinor, agentId: claimed.agentId, voyageId: claimed.voyageId },
    ], { session });

    claimed.ledgerEntryId = entry._id;
    claimed.fx = { rate, baseTotalMinor: Math.round(claimed.totalMinor * rate) };
    claimed.status = L.deriveStatus(claimed);
    await claimed.save({ session });

    await accrueCommission(claimed, roundId, userId, session);
    return claimed.toObject();
  });
};

// R7: commission accrues on issue, independent of the invoice afterwards.
const accrueCommission = async (inv, roundId, userId, session) => {
  const agreement = await AgentAgreement.findOne({
    agentId: inv.agentId, status: 'Active', validFrom: { $lte: inv.invoiceDate },
    $or: [{ validTo: null }, { validTo: { $gte: inv.invoiceDate } }],
  }).sort({ validFrom: -1 }).session(session).lean();
  if (!agreement || !agreement.earnsBookingCommission) return null;
  const lines = await InvoiceLine.find({ invoiceId: inv._id }).session(session).lean();
  const amountMinor = L.computeCommission(agreement, {
    containers: lines.reduce((a, l) => a + l.qty, 0), bookings: inv.lineItems.length, totalMinor: inv.totalMinor,
  });
  if (!(amountMinor > 0)) return null;
  const entry = await ledger.post({
    date: inv.invoiceDate, sourceType: 'Commission', sourceId: inv._id, roundId,
    memo: `Commission on ${inv.invoiceNumber}`, currency: agreement.currency, postedBy: userId,
  }, [
    { accountCode: '5400', debitMinor: amountMinor, agentId: inv.agentId },
    { accountCode: '2000', creditMinor: amountMinor, agentId: inv.agentId },
  ], { session });
  const [row] = await AgentCommission.create([{
    agentId: inv.agentId, roundId, invoiceId: inv._id, agreementId: agreement._id,
    amountMinor, currency: agreement.currency, status: 'Accrued', ledgerEntryId: entry._id,
  }], { session });
  return row;
};

// ─── Cancel (reversal, never delete) ──────────────────────────────────────────
const cancel = async (id, reason, userId, opts = {}) => {
  await lock.assertInvoiceRoundOpen(id);
  if (!reason || !String(reason).trim()) throw new AppError(400, 'A cancellation reason is required', 'REASON_REQUIRED');
  return inTransaction(async (session) => {
    const inv = await Invoice.findById(id).session(session);
    if (!inv || !inv.v2) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (inv.status === 'Cancelled') throw new AppError(409, 'Invoice is already cancelled', 'INVOICE_CANCELLED');
    if (inv.paidMinor > 0 || inv.creditedMinor > 0) {
      throw new AppError(409, 'Void its settlements / credit notes first', 'INVOICE_HAS_SETTLEMENTS');
    }
    if (await Invoice.exists({ parentInvoiceId: inv._id, docKind: 'DebitNote', status: { $ne: 'Cancelled' } }).session(session)) {
      throw new AppError(409, 'Invoice has debit notes', 'INVOICE_HAS_SETTLEMENTS');
    }

    if (inv.status !== 'Draft') {
      await ledger.reverse(inv.ledgerEntryId, `Invoice cancelled: ${reason}`, { session, postedBy: userId });
    }
    if (opts.cancelCommission) { // audit H7: opt-in; commission is otherwise independent of the invoice (R7)
      const AgentCommission = require('../agreements/agentCommission.model');
      const { cancelCommissionTx } = require('../agentAccounts/agentAccounts.service');
      const accrued = await AgentCommission.find({ invoiceId: inv._id, status: 'Accrued' }).session(session);
      for (const c of accrued) await cancelCommissionTx(c._id, `Invoice ${inv.invoiceNumber} cancelled: ${reason}`, userId, session);
    }
    const lines = await InvoiceLine.find({ invoiceId: inv._id }).session(session);
    await InvoiceLine.updateMany({ invoiceId: inv._id }, { $set: { cancelled: true } }, { session });
    await BookingItem.updateMany({ _id: { $in: lines.map((l) => l.bookingItemId) } }, { $set: { locked: false, invoiceLineId: null } }, { session });

    inv.status = 'Cancelled';
    inv.cancelledAt = new Date(); inv.cancelledBy = userId; inv.cancelReason = String(reason).trim();
    inv.updatedBy = userId;
    await inv.save({ session });
    return inv.toObject();
  });
};

// ─── Settlements ──────────────────────────────────────────────────────────────
const bankAccountCode = (bankAccount, method) => {
  if (bankAccount?.type === 'Partner') return '1200';
  return method === 'Cash' ? '1020' : '1010';
};

// opts.session: join a caller's transaction (netting engine). opts.kind 'Offset' is
// reserved for that engine: it settles against Agent Payable instead of a bank.
const recordSettlement = async (invoiceId, data, userId, opts = {}) => {
  await lock.assertInvoiceRoundOpen(invoiceId);
  const kind = opts.kind || 'Cash';
  const runTx = (fn) => (opts.session ? fn(opts.session) : inTransaction(fn));
  const amountMinor = data.amountMinor;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new AppError(400, 'Amount must be a positive whole number of minor units', 'AMOUNT_INVALID');
  if (data.kind && data.kind !== 'Cash') throw new AppError(400, 'Offset settlements are created by the netting engine', 'OFFSET_NOT_AVAILABLE');
  const bank = data.bankAccount?.type === 'Partner' ? { type: 'Partner', partnerId: data.bankAccount.partnerId } : { type: 'Company' };
  if (kind === 'Cash' && bank.type === 'Partner' && !bank.partnerId) throw new AppError(400, 'partnerId is required for a partner bank', 'PARTNER_REQUIRED');

  return runTx(async (session) => {
    // Atomic over-payment guard: the balance check IS the update filter, so
    // two concurrent settlements cannot both pass (closes audit H3).
    const inv = await Invoice.findOneAndUpdate(
      {
        _id: invoiceId, v2: true, docKind: { $in: ['Invoice', 'DebitNote'] }, status: { $in: PAYABLE },
        $expr: { $lte: [{ $add: ['$paidMinor', '$creditedMinor', amountMinor] }, '$totalMinor'] },
      },
      { $inc: { paidMinor: amountMinor } },
      { new: true, session }
    );
    if (!inv) {
      const cur = await Invoice.findById(invoiceId).session(session).lean();
      if (!cur || !cur.v2) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
      if (!PAYABLE.includes(cur.status) && L.balanceMinor(cur) > 0) {
        throw new AppError(409, `Cannot record a settlement on a ${cur.status} invoice`, 'INVOICE_NOT_PAYABLE');
      }
      throw new AppError(409, `Amount exceeds the open balance (${fromMinor(Math.max(0, L.balanceMinor(cur)), cur.currency)})`, 'SETTLEMENT_EXCEEDS_BALANCE');
    }

    const [st] = await InvoiceSettlement.create([{
      invoiceId, agentId: inv.agentId, kind, amountMinor, currency: inv.currency,
      method: data.method || 'Bank Transfer', bankAccount: bank, date: new Date(data.date || Date.now()),
      reference: data.reference || null, notes: data.notes || null, createdBy: userId,
    }], { session });

    const entry = await ledger.post({
      date: st.date, sourceType: 'Settlement', sourceId: st._id,
      roundId: inv.roundId || inv.lineItems?.[0]?.roundId || null,
      memo: `${kind === 'Offset' ? 'Offset against payables for' : 'Receipt for'} ${inv.invoiceNumber}`, currency: inv.currency, postedBy: userId,
    }, [
      kind === 'Offset'
        ? { accountCode: '2000', debitMinor: amountMinor, agentId: inv.agentId }
        : { accountCode: bankAccountCode(bank, st.method), debitMinor: amountMinor, partnerId: bank.type === 'Partner' ? bank.partnerId : null },
      { accountCode: '1100', creditMinor: amountMinor, agentId: inv.agentId },
    ], { session });
    await InvoiceSettlement.updateOne({ _id: st._id }, { $set: { ledgerEntryId: entry._id } }, { session });

    await recalc(invoiceId, session);
    return (await InvoiceSettlement.findById(st._id).session(session).lean());
  });
};

const voidSettlement = async (invoiceId, settlementId, reason, userId, opts = {}) => {
  await lock.assertInvoiceRoundOpen(invoiceId);
  if (!reason || !String(reason).trim()) throw new AppError(400, 'A void reason is required', 'REASON_REQUIRED');
  return (opts.session ? (fn) => fn(opts.session) : inTransaction)(async (session) => {
    const st = await InvoiceSettlement.findOneAndUpdate(
      { _id: settlementId, invoiceId, status: 'Posted' },
      { $set: { status: 'Voided', voidedAt: new Date(), voidedBy: userId, voidReason: String(reason).trim() } },
      { new: true, session }
    );
    if (!st) throw new AppError(404, 'Posted settlement not found', 'SETTLEMENT_NOT_FOUND');
    const rev = await ledger.reverse(st.ledgerEntryId, `Settlement voided: ${reason}`, { session, postedBy: userId });
    await InvoiceSettlement.updateOne({ _id: st._id }, { $set: { voidEntryId: rev._id } }, { session });
    await Invoice.updateOne({ _id: invoiceId }, { $inc: { paidMinor: -st.amountMinor } }, { session });
    await recalc(invoiceId, session);
    return InvoiceSettlement.findById(st._id).session(session).lean();
  });
};

const listSettlements = (invoiceId) =>
  InvoiceSettlement.find({ invoiceId }).populate('bankAccount.partnerId', 'code name').sort({ date: -1, createdAt: -1 }).lean();

// ─── Credit / debit notes ─────────────────────────────────────────────────────
const createNote = async (parentId, kind, data, userId) => {
  await lock.assertInvoiceRoundOpen(parentId);
  const amountMinor = data.amountMinor;
  if (!['CreditNote', 'DebitNote'].includes(kind)) throw new AppError(400, 'Invalid note kind', 'NOTE_KIND');
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new AppError(400, 'Amount must be a positive whole number of minor units', 'AMOUNT_INVALID');
  if (!data.reason || !String(data.reason).trim()) throw new AppError(400, 'A reason is required', 'REASON_REQUIRED');

  return inTransaction(async (session) => {
    const parent = await Invoice.findById(parentId).session(session);
    if (!parent || !parent.v2 || parent.docKind !== 'Invoice') throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (['Draft', 'Cancelled'].includes(parent.status)) throw new AppError(409, 'Notes apply to issued invoices only', 'INVOICE_NOT_POSTED');

    const date = new Date(data.date || Date.now());
    if (kind === 'CreditNote') {
      const ok = await Invoice.findOneAndUpdate(
        { _id: parentId, $expr: { $lte: [{ $add: ['$paidMinor', '$creditedMinor', amountMinor] }, '$totalMinor'] } },
        { $inc: { creditedMinor: amountMinor } },
        { new: true, session }
      );
      if (!ok) throw new AppError(409, 'Credit exceeds the invoice open balance', 'CREDIT_EXCEEDS_BALANCE');
    }

    const number = await nextNumber(kind === 'CreditNote' ? 'creditNote' : 'debitNote');
    const [note] = await Invoice.create([{
      invoiceNumber: number, invoiceType: parent.invoiceType, agentId: parent.agentId,
      voyageId: parent.voyageId, roundId: parent.roundId, lineItems: [],
      invoiceDate: date, dueDate: new Date(data.dueDate || date), currency: parent.currency,
      totalAmount: major(amountMinor, parent.currency), paidAmount: 0, status: 'Issued',
      v2: true, docKind: kind, parentInvoiceId: parent._id, reason: String(data.reason).trim(),
      totalMinor: amountMinor, issuedAt: new Date(), issuedBy: userId, createdBy: userId, updatedBy: userId,
    }], { session });

    const roundId = parent.roundId || parent.lineItems?.[0]?.roundId || null;
    const credit = kind === 'CreditNote';
    const entry = await ledger.post({
      date, sourceType: 'Invoice', sourceId: note._id, roundId,
      memo: `${credit ? 'Credit' : 'Debit'} note ${number} on ${parent.invoiceNumber}`, currency: parent.currency, postedBy: userId,
    }, [
      { accountCode: credit ? '4000' : '1100', debitMinor: amountMinor, agentId: parent.agentId },
      { accountCode: credit ? '1100' : '4000', creditMinor: amountMinor, agentId: parent.agentId },
    ], { session });
    note.ledgerEntryId = entry._id;
    note.status = credit ? 'Issued' : L.deriveStatus(note);
    await note.save({ session });

    if (credit) await recalc(parentId, session);
    return note.toObject();
  });
};

// ─── Reads (list / detail / PDF) ──────────────────────────────────────────────
const pop = (q) =>
  q.populate('agentId', 'agentCode agentName contacts')
   .populate('voyageId', 'voyageNumber voyageName')
   .populate('roundId', 'roundNumber roundName')
   .populate('lineItems.bookingId', 'bookingNumber status containerNumber');

const list = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  agentId = '', status = '', invoiceType = '', docKind = '',
  dateFrom = '', dateTo = '',
} = {}) => {
  const query = {};
  if (agentId)     query.agentId     = agentId;
  if (status === 'Overdue') Object.assign(query, L.overdueMatch());
  else if (status) {
    query.status = status;
    // a stored Issued/Partially Paid that is past due is presented as Overdue (F-06), so it must not match here
    if (status === 'Issued' || status === 'Partially Paid') query.$nor = [L.overdueMatch()];
  }
  if (invoiceType) query.invoiceType = invoiceType;
  if (docKind)     query.docKind     = docKind;
  if (dateFrom || dateTo) {
    query.invoiceDate = {};
    if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
    if (dateTo)   query.invoiceDate.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    pop(Invoice.find(query)).sort({ invoiceDate: -1 }).skip(skip).limit(Number(limit)).lean({ virtuals: true }),
    Invoice.countDocuments(query),
  ]);
  return { data: data.map(presentInvoice), total };
};

const getById = async (id) => {
  const inv = await pop(Invoice.findOne({ _id: id })).lean({ virtuals: true });
  if (!inv) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  return presentInvoice(inv);
};

/** PDF data: header labels + the posted settlements (cash and offsets) as the Payments Received rows. */
const getByIdForPdf = async (id) => {
  const inv = await Invoice.findOne({ _id: id })
    .populate('agentId', 'agentCode agentName contacts')
    .populate('voyageId', 'voyageNumber voyageName')
    .populate('roundId', 'roundNumber roundName')
    .lean({ virtuals: true });
  if (!inv) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  const rows = await InvoiceSettlement.find({ invoiceId: id, status: 'Posted' }).sort({ date: 1 }).lean();
  inv.payments = rows.map((r) => ({
    paymentDate: r.date,
    amount: major(r.amountMinor, r.currency),
    method: r.kind === 'Offset' ? 'Offset' : r.method,
    reference: r.reference,
  }));
  return presentInvoice(inv);
};

/** Bill To contact details for the PDF - presentational, editable in any status. */
const updateBillTo = async (id, billTo = {}) => {
  const invoice = await Invoice.findOne({ _id: id });
  if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  invoice.billTo = {
    phone:   billTo.phone   || null,
    mobile:  billTo.mobile  || null,
    email:   billTo.email   || null,
    jobCode: billTo.jobCode || null,
    taxId:   billTo.taxId   || null,
    address: billTo.address || null,
    office:  billTo.office  || null,
  };
  await invoice.save();
  return getById(id);
};

/** Delete = Draft only (posted invoices are cancelled, never deleted). */
const deleteById = async (id) => {
  const invoice = await Invoice.findOne({ _id: id });
  if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  return deleteDraft(invoice);
};

// ─── Line-item snapshot from a live Booking (historical, never re-read) ───────
const buildLineItemSnapshot = async (booking) => {
  const voyage = await Voyage.findById(booking.voyageId).populate('polId', 'name').populate('podId', 'name').lean();
  const round = voyage?.roundId ? await Round.findById(voyage.roundId).select('roundNumber roundName').lean() : null;
  return {
    bookingId:       booking._id,
    bookingNumber:   booking.bookingNumber,
    containerNumber: booking.containerNumber,
    voyageId:        voyage?._id || null,
    voyageNumber:    voyage?.voyageNumber || null,
    voyageName:      voyage?.voyageName || null,
    roundId:         round?._id || null,
    roundNumber:     round?.roundNumber || null,
    roundName:       round?.roundName || null,
    polName:         voyage?.polId?.name || null,
    podName:         voyage?.podId?.name || null,
    shipper:         booking.shipper || null,
    consignee:       booking.consignee || null,
    commodity:       booking.commodity || null,
    freightAmount:   booking.totalFreight,
  };
};

module.exports = {
  createDraft, updateDraft, deleteDraft, issue, cancel,
  recordSettlement, voidSettlement, listSettlements, createNote,
  recalc, presentInvoice,
  list, getById, getByIdForPdf, updateBillTo, deleteById, buildLineItemSnapshot,
};
