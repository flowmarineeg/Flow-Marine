'use strict';

// Pure rules: which voyage of a round carries a booking from POL to POD.
// No DB access. A voyage is a run over the round's legs; `portCalls` lists its ports in travel order
// (`[{ legKey, portId, eta, etd }]`), so a westbound run lists its ports in reverse. A booking is
// carried by a voyage when the voyage visits POL and then, later in its run, POD. Ports can repeat
// inside a run (A-B-C-A), so positions are identified by `legKey`.

const DEAD_STATUS = ['Cancelled', 'Completed'];
const DEPARTED_STATUS = ['Departed', 'In Transit', 'Arrived'];
const bad = (message) => ({ status: 400, message });
const sid = (v) => (v == null ? '' : String(v._id || v));

/**
 * Best POL -> POD span inside one run, or null. polLegKey/podLegKey (optional) pin the exact calls when
 * a port repeats. Among several spans the shortest wins (first one on a tie).
 */
const matchRun = (portCalls, polId, podId, { polLegKey, podLegKey } = {}) => {
  const calls = portCalls || [];
  let best = null;
  for (let i = 0; i < calls.length; i++) {
    if (sid(calls[i].portId) !== sid(polId)) continue;
    if (polLegKey && calls[i].legKey !== polLegKey) continue;
    for (let j = i + 1; j < calls.length; j++) {
      if (sid(calls[j].portId) !== sid(podId)) continue;
      if (podLegKey && calls[j].legKey !== podLegKey) continue;
      if (!best || j - i < best.podIdx - best.polIdx) best = { polIdx: i, podIdx: j, polLegKey: calls[i].legKey, podLegKey: calls[j].legKey };
      break; // nearest POD after this POL
    }
  }
  return best;
};

const time = (d) => (d ? new Date(d).getTime() : null);

/** Departure time at the booking's POL on this voyage (call etd, else the voyage etd for the first port). */
const polDeparture = (voyage, polCall, polIdx) => {
  const t = time(polCall?.etd);
  if (t != null) return t;
  return polIdx === 0 ? time(voyage.atd) ?? time(voyage.etd) : null;
};

const notDeparted = (voyage, dep, now) => {
  if (dep != null) return dep >= now;
  return !DEPARTED_STATUS.includes(voyage.status);
};

const compare = (a, b) => {
  if (a.notDeparted !== b.notDeparted) return a.notDeparted ? -1 : 1;
  const ta = a.dep ?? Infinity;
  const tb = b.dep ?? Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return 0; // genuinely tied
};

/**
 * All live voyages that carry POL -> POD, best first. voyages: lean Voyage docs of ONE round.
 * Result: { status: 'resolved' | 'ambiguous' | 'unresolved', voyage, polLegKey, podLegKey, candidates[] }.
 *  - exactly one eligible voyage -> resolved;
 *  - several -> ranked (not yet departed from POL first, then earliest departure); a strictly best one is
 *    resolved (`ranked: true`), a tie stays ambiguous and the caller must choose among `candidates`.
 */
const findVoyageForBooking = ({ voyages, polId, podId, polLegKey, podLegKey, now = Date.now() }) => {
  if (!polId || !podId) throw bad('POL and POD are required');
  if (sid(polId) === sid(podId)) throw bad('POL and POD must be different ports');
  const found = [];
  for (const v of voyages || []) {
    if (DEAD_STATUS.includes(v.status)) continue;
    const m = matchRun(v.portCalls, polId, podId, { polLegKey, podLegKey });
    if (!m) continue;
    const dep = polDeparture(v, v.portCalls[m.polIdx], m.polIdx);
    found.push({ voyage: v, polLegKey: m.polLegKey, podLegKey: m.podLegKey, dep, notDeparted: notDeparted(v, dep, now), seq: v.sequence ?? 0 });
  }
  found.sort((a, b) => compare(a, b) || a.seq - b.seq);
  const out = (c) => ({ voyage: c.voyage, polLegKey: c.polLegKey, podLegKey: c.podLegKey });
  const candidates = found.map(out);
  if (!found.length) return { status: 'unresolved', voyage: null, polLegKey: null, podLegKey: null, candidates: [] };
  if (found.length === 1) return { status: 'resolved', ranked: false, ...out(found[0]), candidates };
  if (compare(found[0], found[1]) < 0) return { status: 'resolved', ranked: true, ...out(found[0]), candidates };
  return { status: 'ambiguous', voyage: null, polLegKey: null, podLegKey: null, candidates };
};

/** The user chose a voyage among the candidates: it must really carry POL -> POD. */
const checkChosenVoyage = ({ voyages, voyageId, polId, podId, polLegKey, podLegKey, now }) => {
  const r = findVoyageForBooking({ voyages, polId, podId, polLegKey, podLegKey, now });
  const hit = r.candidates.find((c) => sid(c.voyage) === sid(voyageId));
  if (!hit) return { status: 'unresolved', voyage: null, polLegKey: null, podLegKey: null, candidates: r.candidates, overrideInvalid: true };
  return { status: 'resolved', ranked: false, manual: true, ...hit, candidates: r.candidates };
};

module.exports = { DEAD_STATUS, matchRun, findVoyageForBooking, checkChosenVoyage };
