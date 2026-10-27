'use strict';

// Pure voyage rules (RV-18/19/20, RV-22). No DB access.

const toTime = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};
const bad = (message) => ({ status: 400, message });

/**
 * Hard errors on the COMPLETE resulting voyage state (not just the patch).
 * state: { etd, eta, atd, ata, status }.
 * statusChanged: the request moves the voyage into `status` (or it is a new voyage). Required actuals are
 * checked only then, so legacy rows already stored as Departed without an ATD can still be edited.
 */
const validateVoyageState = (state, { statusChanged = false } = {}) => {
  const etd = toTime(state.etd), eta = toTime(state.eta), atd = toTime(state.atd), ata = toTime(state.ata);
  if (etd !== null && eta !== null && eta < etd) throw bad('ETA cannot be earlier than ETD');
  if (atd !== null && ata !== null && ata < atd) throw bad('ATA cannot be earlier than ATD');
  if (statusChanged) {
    if (state.status === 'Departed' && atd === null) throw bad('Actual departure (ATD) is required to mark a voyage as Departed');
    if (state.status === 'Arrived' && ata === null) throw bad('Actual arrival (ATA) is required to mark a voyage as Arrived');
  }
};

/**
 * Non-blocking warnings. round: { startDate, endDate }; previous: the voyage with the next-lower sequence
 * in the same round (or null).
 */
const scheduleWarnings = (state, round, previous) => {
  const out = [];
  const lo = toTime(round?.startDate), hi = toTime(round?.endDate);
  if (lo !== null && hi !== null) {
    for (const f of ['etd', 'eta', 'etp', 'atd', 'ata']) {
      const t = toTime(state[f]);
      if (t !== null && (t < lo || t > hi)) out.push(`${f.toUpperCase()} is outside the round window`);
    }
  }
  const etd = toTime(state.etd), prevEta = toTime(previous?.eta);
  if (etd !== null && prevEta !== null && etd < prevEta) {
    out.push('ETD is earlier than the previous voyage ETA');
  }
  return out;
};

/**
 * Deleting is allowed for a manual voyage, or for the LAST generated voyage of the round. A middle generated
 * voyage would break the POL/POD chain, so it must be cancelled instead.
 * voyage: { isManual, sequence }; siblings: other voyages of the round [{ isManual, sequence }].
 */
const deleteBlockReason = (voyage, siblings) => {
  if (voyage.isManual) return null;
  const laterGenerated = siblings.some((s) => !s.isManual && s.sequence > voyage.sequence);
  return laterGenerated
    ? 'Cannot delete — this voyage is in the middle of the route chain. Cancel it instead (status → Cancelled).'
    : null;
};

module.exports = { validateVoyageState, scheduleWarnings, deleteBlockReason };
