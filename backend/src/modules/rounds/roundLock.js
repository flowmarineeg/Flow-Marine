'use strict';

const AppError = require('../../utils/AppError');

// Sprint053 R5 - the ONE closed-Round guard. Every mutating service calls it
// (not DB triggers). Models are required lazily to avoid require cycles.
// A Round without closeStatus (every pre-V2 document) reads as Open.
const model = (name) => require('mongoose').model(name);

const refuse = (roundNumber) =>
  new AppError(409, `Round ${roundNumber || ''} is closed - reopen it (with a reason) to make changes`.replace('  ', ' '), 'ROUND_CLOSED');

const assertRoundOpen = async (roundId, { session = null } = {}) => {
  if (!roundId) return;
  const r = await model('Round').findById(roundId).select('closeStatus roundNumber').session(session).lean();
  if (r && r.closeStatus === 'Closed') throw refuse(r.roundNumber);
};

const assertRoundsOpen = async (roundIds, opts) => {
  const ids = [...new Set((roundIds || []).filter(Boolean).map(String))];
  for (const id of ids) await assertRoundOpen(id, opts);
};

const roundsOfVoyages = async (voyageIds) => {
  const ids = [...new Set((voyageIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];
  return (await model('Voyage').find({ _id: { $in: ids } }).select('roundId').lean()).map((v) => v.roundId);
};

const assertVoyageRoundOpen = async (voyageId, opts) => assertRoundsOpen(await roundsOfVoyages([voyageId]), opts);
const assertVoyagesRoundOpen = async (voyageIds, opts) => assertRoundsOpen(await roundsOfVoyages(voyageIds), opts);

/** Doc that carries voyageId (Booking, ManualBooking, TrackingHistory). */
const assertDocRoundOpen = async (modelName, id, opts) => {
  const d = await model(modelName).findById(id).select('voyageId').lean();
  if (d?.voyageId) await assertVoyageRoundOpen(d.voyageId, opts);
};

/** Expense: round directly, or through its voyage. Accepts an id or {roundId, voyageId}. */
const assertExpenseRoundOpen = async (idOrScope, opts) => {
  let s = idOrScope;
  if (typeof idOrScope === 'string' || (idOrScope && idOrScope._bsontype)) {
    s = await model('Expense').findById(idOrScope).select('roundId voyageId').lean();
  }
  if (!s) return;
  if (s.roundId) await assertRoundOpen(s.roundId, opts);
  if (s.voyageId) await assertVoyageRoundOpen(s.voyageId, opts);
};

/** Invoice (V1 or V2): its own round, or the rounds of its line items. */
const assertInvoiceRoundOpen = async (invoiceId, opts) => {
  const inv = await model('Invoice').findById(invoiceId).select('roundId voyageId lineItems.roundId lineItems.voyageId').lean();
  if (!inv) return;
  const rounds = [inv.roundId, ...(inv.lineItems || []).map((l) => l.roundId)];
  await assertRoundsOpen(rounds, opts);
  if (inv.voyageId) await assertVoyageRoundOpen(inv.voyageId, opts);
};

const assertBookingsRoundOpen = async (bookingIds, opts) => {
  const b = await model('Booking').find({ _id: { $in: bookingIds || [] } }).select('voyageId').lean();
  await assertVoyagesRoundOpen(b.map((x) => x.voyageId), opts);
};

const assertItemsRoundOpen = async (itemIds, opts) => {
  const it = await model('BookingItem').find({ _id: { $in: itemIds || [] } }).select('voyageId').lean();
  await assertVoyagesRoundOpen(it.map((x) => x.voyageId), opts);
};

/**
 * Atomic variant used INSIDE a transaction (audit H4). It writes to the Round document, so a posting
 * and a concurrent Round close conflict and one of them retries: a ledger line can never land in a Round
 * after its settlement was finalised.
 */
const assertRoundOpenTx = async (roundId, session) => {
  if (!roundId) return;
  const r = await model('Round').updateOne({ _id: roundId, closeStatus: { $ne: 'Closed' } }, { $inc: { lockVersion: 1 } }, { session });
  if (r.matchedCount === 0) {
    const round = await model('Round').findById(roundId).select('closeStatus roundNumber').session(session).lean();
    if (round) throw refuse(round.roundNumber);
  }
};

/**
 * A booking may only attach to a voyage whose parent Round is Planned or Active (RV-26). The voyage's own
 * status is checked separately by the booking services; this catches a voyage left Scheduled under a dead round.
 */
const assertRoundBookable = async (voyage) => {
  const r = await model('Round').findById(voyage.roundId).select('status roundNumber').lean();
  if (!r) throw new AppError(400, 'The voyage has no parent round', 'ROUND_NOT_FOUND');
  if (['Cancelled', 'Completed'].includes(r.status)) {
    throw new AppError(400, `Cannot book on a voyage of a ${r.status} round (${r.roundNumber})`, 'ROUND_NOT_BOOKABLE');
  }
};

/** Ids of closed rounds - used by bulk flows (netting) to skip them instead of failing. */
const closedRoundIds = async () => (await model('Round').find({ closeStatus: 'Closed' }).select('_id').lean()).map((r) => String(r._id));

module.exports = {
  assertRoundOpen, assertRoundsOpen, assertVoyageRoundOpen, assertVoyagesRoundOpen, assertDocRoundOpen,
  assertExpenseRoundOpen, assertInvoiceRoundOpen, assertBookingsRoundOpen, assertItemsRoundOpen, closedRoundIds, assertRoundOpenTx, assertRoundBookable,
};
