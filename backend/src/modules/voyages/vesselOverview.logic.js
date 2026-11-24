'use strict';

// Pure logic of the Voyages vessel pages (no DB, no I/O): which rounds / voyages are "open", and how the vessel rows
// and the per-round blocks are assembled from the capacity engine rows. Numbers are never computed here from bookings:
// they come from computeRoundCapacity (rule: voyage totals = capacity engine + bookingSummary, never a fourth source).
// Decisions D1-D3 of sprints/vessel-first-navigation-2026-11-23-sprint.md.

// D1: a round is open while it can still change (Planned, Active); a voyage while it is not Completed or Cancelled.
const OPEN_ROUND_STATUSES = Object.freeze(['Planned', 'Active']);
const OPEN_VOYAGE_STATUSES = Object.freeze(['Scheduled', 'Departed', 'In Transit', 'Arrived']);

const isOpenRound = (status) => OPEN_ROUND_STATUSES.includes(status);
const isOpenVoyage = (status) => OPEN_VOYAGE_STATUSES.includes(status);

const time = (d) => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isNaN(t) ? Infinity : t;
};
const byTime = (a, b) => (a === b ? 0 : a < b ? -1 : 1); // Infinity-safe (Infinity - Infinity is NaN)
const label = (v) => v?.voyageName || v?.voyageNumber || '';

/** Active round first, then the earliest start date (no date last), then round number. */
const orderRounds = (rounds) => [...rounds].sort((a, b) => {
  const act = (b.status === 'Active') - (a.status === 'Active');
  if (act !== 0) return act;
  const d = byTime(time(a.startDate), time(b.startDate));
  if (d !== 0) return d;
  return String(a.roundNumber || '').localeCompare(String(b.roundNumber || ''));
});

/** The voyage that sails next: earliest ETD among the open ones (no ETD last), then voyage number. Null when none. */
const nextVoyage = (voyages) => {
  const open = (voyages || []).filter((v) => isOpenVoyage(v.status));
  if (!open.length) return null;
  const v = [...open].sort((a, b) => byTime(time(a.etd), time(b.etd)) || String(a.voyageNumber || '').localeCompare(String(b.voyageNumber || '')))[0];
  return { voyageId: v._id, label: label(v), voyageNumber: v.voyageNumber || null, etd: v.etd || null, status: v.status };
};

/** One voyage row from the capacity engine row (null/undefined = the engine has no row: nothing placed, no percent). */
const voyageNumbers = (row) => ({
  loadedTEU: Number(row?.loadedTEU) || 0,
  onboardTEU: Number(row?.onboardTEU) || 0, // peak aboard over the run's legs
  remainingTEU: row?.remainingTEU ?? null,
  utilisationPct: row?.utilisationPct ?? null,
});

/** D3: booked = sum of loaded TEU of the voyages, peak = highest utilisation (never a sum), overbooked = any voyage over 100 %. */
const totalsOf = (numbers) => {
  const pcts = numbers.map((n) => n.utilisationPct).filter((p) => p != null);
  return {
    bookedTEU: numbers.reduce((s, n) => s + n.loadedTEU, 0),
    peakUtilisationPct: pcts.length ? Math.max(...pcts) : null,
    overbooked: numbers.some((n) => n.remainingTEU != null && n.remainingTEU < 0),
  };
};

/**
 * Level 2 block of one round. `voyages` = open voyage docs (populated polId/podId), `capRows` = Map(voyageId -> engine row).
 * Voyages keep the round's `sequence` order.
 */
const roundBlock = (round, voyages, capRows) => {
  const rows = [...voyages].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map((v) => ({
    _id: v._id,
    voyageNumber: v.voyageNumber,
    voyageName: v.voyageName || null,
    direction: v.direction || null,
    status: v.status,
    polId: v.polId || null,
    podId: v.podId || null,
    etd: v.etd || null, eta: v.eta || null, atd: v.atd || null, ata: v.ata || null,
    ...voyageNumbers(capRows.get(String(v._id))),
  }));
  return {
    round: {
      _id: round._id, roundNumber: round.roundNumber, roundName: round.roundName || null, status: round.status,
      startDate: round.startDate || null, endDate: round.endDate || null,
    },
    totals: totalsOf(rows),
    voyages: rows,
  };
};

/** Level 1 row of one vessel from its round blocks (open rounds that have open voyages). */
const vesselRow = (vessel, blocks) => {
  const ordered = orderRounds(blocks.map((b) => b.round)).map((r) => blocks.find((b) => String(b.round._id) === String(r._id)));
  const allVoyages = ordered.flatMap((b) => b.voyages);
  const first = ordered[0]?.round || null;
  const next = nextVoyage(allVoyages);
  const t = totalsOf(allVoyages);
  return {
    vesselId: vessel._id,
    vesselCode: vessel.vesselCode,
    vesselName: vessel.vesselName,
    capacity: vessel.capacity ?? null,
    primaryRound: first && { roundId: first._id, roundNumber: first.roundNumber, roundName: first.roundName, status: first.status },
    rounds: ordered.map((b) => ({ roundId: b.round._id, roundNumber: b.round.roundNumber, roundName: b.round.roundName, status: b.round.status })),
    extraRounds: Math.max(0, ordered.length - 1),
    nextVoyage: next,
    extraVoyages: Math.max(0, allVoyages.length - 1),
    openVoyages: allVoyages.length,
    bookedTEU: t.bookedTEU,
    peakUtilisationPct: t.peakUtilisationPct,
    overbooked: t.overbooked,
  };
};

module.exports = {
  OPEN_ROUND_STATUSES, OPEN_VOYAGE_STATUSES, isOpenRound, isOpenVoyage,
  orderRounds, nextVoyage, voyageNumbers, totalsOf, roundBlock, vesselRow,
};
