'use strict';

// Pure rules for a voyage that is one run over a range of a round's legs (e.g. leg 1 -> leg 4, eastbound).
// No DB access. A "leg" here is a round leg: { legKey, sequence, portId, portName, portCode }.

const { VOYAGE_DIRECTION } = require('../../config/constants');

const DIRECTION_LETTER = { East: 'E', West: 'W', North: 'N', South: 'S' };
const bad = (message) => ({ status: 400, message });

const directionLetter = (direction) => {
  const l = DIRECTION_LETTER[direction];
  if (!l) throw bad(`Direction must be one of: ${VOYAGE_DIRECTION.join(', ')}`);
  return l;
};

/** base is the counter part from autoNumber ('V0001'); the destination letter is appended: V0001E. */
const formatVoyageNumber = (base, direction) => `${base}${directionLetter(direction)}`;

const sortLegs = (legs) => [...(legs || [])].sort((a, b) => a.sequence - b.sequence);

/**
 * Ports of the run, in travel order. fromKey -> toKey may go forward (leg 1 -> 4) or backward (4 -> 1).
 * Throws when a key is unknown, both keys are the same leg, or two consecutive calls are the same port.
 */
const buildPortCalls = (legs, fromKey, toKey) => {
  const sorted = sortLegs(legs);
  const i = sorted.findIndex((l) => l.legKey === fromKey);
  const j = sorted.findIndex((l) => l.legKey === toKey);
  if (i < 0) throw bad('Start leg is not on the round route');
  if (j < 0) throw bad('End leg is not on the round route');
  if (i === j) throw bad('Start leg and end leg must be different');
  const step = i < j ? 1 : -1;
  const calls = [];
  for (let k = i; k !== j + step; k += step) {
    const l = sorted[k];
    calls.push({ legKey: l.legKey, portId: l.portId, portName: l.portName || null, portCode: l.portCode || null, eta: null, etd: null });
  }
  for (let k = 0; k < calls.length - 1; k++) {
    if (String(calls[k].portId) === String(calls[k + 1].portId)) {
      throw bad(`Legs ${k + 1} and ${k + 2} of this run use the same port`);
    }
  }
  return calls;
};

/** Index range [lo, hi] a run covers on the sorted legs (direction independent), or null if a key is missing. */
const legRange = (legs, fromKey, toKey) => {
  const sorted = sortLegs(legs);
  const i = sorted.findIndex((l) => l.legKey === fromKey);
  const j = sorted.findIndex((l) => l.legKey === toKey);
  if (i < 0 || j < 0) return null;
  return [Math.min(i, j), Math.max(i, j)];
};

/**
 * Warning (never an error) when another live voyage of the round has the same direction and overlapping legs.
 * others: [{ voyageNumber, direction, fromLegKey, toLegKey, status }]
 */
const overlapWarnings = (legs, run, others) => {
  const mine = legRange(legs, run.fromLegKey, run.toLegKey);
  if (!mine) return [];
  const out = [];
  for (const o of others || []) {
    if (o.status === 'Cancelled' || o.direction !== run.direction) continue;
    const r = legRange(legs, o.fromLegKey, o.toLegKey);
    if (r && r[0] <= mine[1] && mine[0] <= r[1]) {
      out.push(`Voyage ${o.voyageNumber} already runs ${run.direction.toLowerCase()}bound over some of the same legs`);
    }
  }
  return out;
};

/**
 * Warnings after a round's legs were edited: live voyages whose leg was removed, or whose stored port
 * differs from the leg's current port. Voyages are never rewritten silently.
 */
const legsChangeWarnings = (newLegs, voyages) => {
  const byKey = new Map((newLegs || []).map((l) => [l.legKey, l]));
  const out = [];
  for (const v of voyages || []) {
    if (v.status === 'Cancelled') continue;
    const calls = v.portCalls || [];
    const removed = calls.filter((c) => !byKey.has(c.legKey));
    const changed = calls.filter((c) => byKey.has(c.legKey) && String(byKey.get(c.legKey).portId) !== String(c.portId));
    if (removed.length) out.push(`Voyage ${v.voyageNumber} calls at ${removed.length} leg(s) that no longer exist — review or refresh its port calls`);
    if (changed.length) out.push(`Voyage ${v.voyageNumber} has ${changed.length} port(s) that differ from the edited legs — review or refresh its port calls`);
  }
  return out;
};

/**
 * Per-port dates sent by the client: [{ legKey, eta, etd }] merged onto the voyage's portCalls by legKey.
 * An arrival cannot be after its own departure. Unknown keys are an error.
 */
const mergePortCallDates = (portCalls, patch) => {
  if (patch === undefined) return portCalls;
  if (!Array.isArray(patch)) throw bad('portCalls must be a list');
  const t = (v) => (v ? new Date(v) : null);
  const byKey = new Map(patch.map((p) => [p.legKey, p]));
  for (const k of byKey.keys()) {
    if (!portCalls.some((c) => c.legKey === k)) throw bad('A port call date refers to a leg that is not part of this voyage');
  }
  return portCalls.map((c) => {
    const p = byKey.get(c.legKey);
    if (!p) return c;
    const eta = p.eta !== undefined ? t(p.eta) : c.eta;
    const etd = p.etd !== undefined ? t(p.etd) : c.etd;
    if (eta && Number.isNaN(eta.getTime())) throw bad(`Invalid ETA for ${c.portName || 'port'}`);
    if (etd && Number.isNaN(etd.getTime())) throw bad(`Invalid ETD for ${c.portName || 'port'}`);
    if (eta && etd && etd < eta) throw bad(`${c.portName || 'Port'}: departure cannot be earlier than arrival`);
    return { ...(c.toObject ? c.toObject() : c), eta, etd };
  });
};

module.exports = {
  DIRECTION_LETTER, directionLetter, formatVoyageNumber, buildPortCalls, legRange,
  overlapWarnings, legsChangeWarnings, mergePortCallDates,
};
