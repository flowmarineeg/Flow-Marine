'use strict';

// DB side of the voyage auto-assignment (bookings sprint 2026-11-10). The matching itself is pure
// (voyageMatch.logic.js). Here: load the round, check it can take bookings, run the match, turn the
// outcome into an HTTP-shaped error. Used by Layer 1, Layer 2, the Excel import and the form lookup.

const mongoose = require('mongoose');
const lock = require('../rounds/roundLock');
const Round = require('../rounds/round.model');
const Voyage = require('../voyages/voyage.model');
const Match = require('./voyageMatch.logic');

const VOYAGE_FIELDS = 'voyageNumber voyageName direction status sequence etd eta atd ata roundId polId podId portCalls';

const bad = (status, message, extra = {}) => ({ status, message, ...extra });

/** The round must exist, be Planned/Active and not closed. Returns the lean round. */
const loadBookableRound = async (roundId, { session = null } = {}) => {
  if (!roundId || !mongoose.isValidObjectId(roundId)) throw bad(400, 'Round is required');
  const round = await Round.findById(roundId).select('status roundNumber roundName closeStatus').session(session).lean();
  if (!round) throw bad(400, 'Round not found');
  if (['Cancelled', 'Completed'].includes(round.status)) {
    throw bad(400, `Cannot book on a ${round.status} round (${round.roundNumber})`, { code: 'ROUND_NOT_BOOKABLE' });
  }
  await lock.assertRoundOpen(roundId, { session });
  return round;
};

const loadRoundVoyages = (roundId, { session = null } = {}) =>
  Voyage.find({ roundId }).select(VOYAGE_FIELDS).session(session).lean();

const summary = (c) => ({
  voyageId: String(c.voyage._id),
  voyageNumber: c.voyage.voyageNumber,
  voyageName: c.voyage.voyageName || null,
  direction: c.voyage.direction || null,
  status: c.voyage.status,
  polLegKey: c.polLegKey,
  podLegKey: c.podLegKey,
});

/** Same outcome as the matcher, in a JSON-safe shape for the API / import preview. */
const describe = (r) => ({
  status: r.status,
  ranked: !!r.ranked,
  manual: !!r.manual,
  overrideInvalid: !!r.overrideInvalid,
  voyage: r.voyage ? summary(r) : null,
  candidates: (r.candidates || []).map(summary),
});

/** Run the matcher against already-loaded voyages (the import loads them once for the whole file). */
const match = ({ voyages, polId, podId, polLegKey, podLegKey, voyageId }) =>
  voyageId
    ? Match.checkChosenVoyage({ voyages, voyageId, polId, podId, polLegKey, podLegKey })
    : Match.findVoyageForBooking({ voyages, polId, podId, polLegKey, podLegKey });

/**
 * Resolve the voyage for one booking, or throw:
 *  - 400 when no voyage of the round runs POL -> POD (or the chosen voyage does not);
 *  - 409 VOYAGE_AMBIGUOUS when several tie (the caller must resend with `voyageId` picked from `errors`).
 * Returns { round, voyage, polLegKey, podLegKey, resolution }.
 */
const resolveVoyage = async ({ roundId, polId, podId, polLegKey, podLegKey, voyageId, session = null }) => {
  const round = await loadBookableRound(roundId, { session });
  const voyages = await loadRoundVoyages(roundId, { session });
  const r = match({ voyages, polId, podId, polLegKey, podLegKey, voyageId });
  const resolution = describe(r);
  if (r.status === 'unresolved') {
    throw bad(400, r.overrideInvalid
      ? 'The chosen voyage does not run from this POL to this POD'
      : 'No voyage of this round runs from this POL to this POD', { code: 'VOYAGE_UNRESOLVED' });
  }
  if (r.status === 'ambiguous') {
    throw bad(409, 'More than one voyage of this round runs from this POL to this POD - choose one', { code: 'VOYAGE_AMBIGUOUS', errors: resolution.candidates });
  }
  return { round, voyage: r.voyage, polLegKey: r.polLegKey, podLegKey: r.podLegKey, resolution };
};

/** Non-throwing variant for the form: what would be assigned right now. */
const previewVoyage = async ({ roundId, polId, podId, polLegKey, podLegKey }) => {
  await loadBookableRound(roundId);
  const voyages = await loadRoundVoyages(roundId);
  return describe(match({ voyages, polId, podId, polLegKey, podLegKey }));
};

module.exports = { loadBookableRound, loadRoundVoyages, resolveVoyage, previewVoyage, describe, match };
