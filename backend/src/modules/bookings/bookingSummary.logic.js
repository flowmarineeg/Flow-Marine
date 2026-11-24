'use strict';

// Pure helpers for the per-voyage booking summary (no DB). TEU for Layer 2 comes from the container SIZE through the
// untouched teuResolver (rule R10); Layer 1 already stores totalTEU on each booking.
const { resolveTEU } = require('../../utils/teuResolver');

const TABS = Object.freeze(['estimated', 'operational', 'discharged', 'remaining']);
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Layer 1 groups [{ _id: voyageId, bookings, totalFreight, totalTEU }] -> Map(voyageId -> totals). */
const summariseEstimated = (groups) => {
  const out = new Map();
  for (const g of groups) out.set(String(g._id), { bookings: g.bookings, totalFreight: money(g.totalFreight), totalTEU: Number(g.totalTEU) || 0 });
  return out;
};

/**
 * Layer 2 groups [{ voyageId, containerTypeId, count, freight }] + Map(containerTypeId -> size) -> Map(voyageId -> totals).
 * One Layer 2 booking = one container, so TEU = sum(count x TEU(size)).
 */
const summariseOperational = (groups, sizeById) => {
  const out = new Map();
  for (const g of groups) {
    const key = String(g.voyageId);
    const cur = out.get(key) || { bookings: 0, totalFreight: 0, totalTEU: 0 };
    cur.bookings += g.count;
    cur.totalFreight += Number(g.freight) || 0;
    cur.totalTEU += g.count * resolveTEU(sizeById.get(String(g.containerTypeId))).teu;
    out.set(key, cur);
  }
  for (const v of out.values()) v.totalFreight = money(v.totalFreight);
  return out;
};

/** Newest round first, then voyage number, so the list reads like the rounds screen. */
const sortRows = (rows) => [...rows].sort((a, b) => {
  const d = (new Date(b.roundStart || 0)) - (new Date(a.roundStart || 0));
  if (d !== 0) return d;
  return String(a.voyageNumber || '').localeCompare(String(b.voyageNumber || ''));
});

const STATUSES = Object.freeze(['Pending', 'Confirmed', 'Final Loading', 'Cancelled']);
const emptyByStatus = () => Object.fromEntries(STATUSES.map((s) => [s, { bookings: 0, freight: 0, teu: 0 }]));

/**
 * Per-status totals of ONE voyage (Voyage Details page). All four statuses are always present so chips add up.
 * Layer 1 groups: [{ _id: status, bookings, totalFreight, totalTEU }]  (TEU stored on the estimate)
 * Layer 2 groups: [{ status, containerTypeId, count, freight }] + Map(containerTypeId -> size)  (one booking = one container)
 * Returns { Pending: {bookings, freight, teu}, ... }.
 */
const summariseByStatus = (groups, layer, sizeById = new Map()) => {
  const out = emptyByStatus();
  for (const g of groups) {
    const s = layer === 1 ? g._id : g.status;
    if (!out[s]) continue; // unknown status: ignore, never invent a chip
    if (layer === 1) {
      out[s].bookings += g.bookings; out[s].freight += Number(g.totalFreight) || 0; out[s].teu += Number(g.totalTEU) || 0;
    } else {
      out[s].bookings += g.count; out[s].freight += Number(g.freight) || 0;
      out[s].teu += g.count * resolveTEU(sizeById.get(String(g.containerTypeId))).teu;
    }
  }
  for (const s of STATUSES) out[s].freight = money(out[s].freight);
  return out;
};

/**
 * Port filter for the booking lists: bookings whose POL or POD is that port call.
 * With a leg key the key wins per side, and a side without a key falls back to the port id (old data).
 * With only a port id, either side matching the port counts. Returns a Mongo $or array, or null (no filter).
 */
const portMatch = (legKey, portId) => {
  const k = legKey ? String(legKey) : '';
  const p = portId ? String(portId) : '';
  if (k) {
    const or = [{ polLegKey: k }, { podLegKey: k }];
    if (p) or.push({ polLegKey: null, polId: p }, { podLegKey: null, podId: p });
    return or;
  }
  return p ? [{ polId: p }, { podId: p }] : null;
};

/** portMatch with the port id validated: a bad id is a 400, never a CastError. */
const portFilter = (legKey, portId) => {
  if (portId && !require('mongoose').isValidObjectId(String(portId))) throw { status: 400, message: 'Invalid port' };
  return portMatch(legKey, portId);
};

// ── Vessel -> round roll-ups (sprint vessel-first-navigation, Sprint C1) ─────────────────────────────────────────
// Level 1 = vessels, level 2 = rounds, both built from the SAME per-voyage totals as the voyage summary, so every
// number adds up to the rows one level down. Pure: the service fetches, this file only assembles.

/** Rounds shown: Planned/Active always, Completed only with "include completed rounds". Cancelled rounds never. */
const roundStatusesFor = (includeClosed) => (includeClosed ? ['Planned', 'Active', 'Completed'] : ['Planned', 'Active']);

/**
 * Owner decision (D6): "Include completed rounds" is ON by default for Discharged and Remaining (discharge happens at the
 * end of a round), OFF for Estimated and Operational. An explicit value ('1'/'true'/'0'/'false') always wins.
 */
const parseIncludeClosed = (raw, tab) => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return tab === 'discharged' || tab === 'remaining';
};

/**
 * D7: Estimated and Operational list every open vessel/round that has a live voyage even with 0 bookings (so booking can
 * start from there). Discharged/Remaining, partner users, and any booking-level filter list only what has bookings.
 */
const wantsZeroRows = (tab, { scoped = false, search = '', agentId = '', partnerId = '', status = '' } = {}) =>
  (tab === 'estimated' || tab === 'operational') && !scoped && !search && !agentId && !partnerId && !status;

const roundOrder = (a, b) => {
  const act = (b.roundStatus === 'Active') - (a.roundStatus === 'Active');
  if (act !== 0) return act;
  const t = (d) => (d ? new Date(d).getTime() : Infinity);
  const [ta, tb] = [t(a.startDate), t(b.startDate)];
  if (ta !== tb) return ta < tb ? -1 : 1;
  return String(a.roundNumber || '').localeCompare(String(b.roundNumber || ''));
};

/**
 * One row per round. rounds: [{_id, vesselId, roundNumber, roundName, status, startDate}], voyages: [{_id, roundId, status}],
 * totals: Map(voyageId -> {bookings, totalFreight, totalTEU}). A round is kept when it has bookings, or (zeroRows) when it
 * has at least one non-Cancelled voyage. `voyages` counts the non-Cancelled voyages.
 */
const rollupRounds = ({ rounds, voyages, totals, zeroRows }) => {
  const byRound = new Map();
  for (const v of voyages) {
    const k = String(v.roundId);
    if (!byRound.has(k)) byRound.set(k, []);
    byRound.get(k).push(v);
  }
  const out = [];
  for (const r of rounds) {
    const vs = byRound.get(String(r._id)) || [];
    let bookings = 0; let freight = 0; let teu = 0;
    for (const v of vs) {
      const t = totals.get(String(v._id));
      if (t) { bookings += t.bookings; freight += t.totalFreight; teu += t.totalTEU; }
    }
    const live = vs.filter((v) => v.status !== 'Cancelled').length;
    if (!(bookings > 0 || (zeroRows && live > 0))) continue;
    out.push({
      roundId: r._id, vesselId: r.vesselId, roundNumber: r.roundNumber, roundName: r.roundName || null,
      roundStatus: r.status, startDate: r.startDate || null,
      voyages: live, bookings, totalTEU: teu, totalFreight: money(freight),
    });
  }
  return out.sort(roundOrder);
};

/** One row per vessel from the round rows; `vessels` = Map(vesselId -> {vesselCode, vesselName}). Sorted by vessel name. */
const rollupVessels = (roundRows, vessels) => {
  const out = new Map();
  for (const r of roundRows) {
    const k = String(r.vesselId);
    const v = vessels.get(k);
    if (!v) continue; // a round without a vessel record cannot be shown
    const cur = out.get(k) || { vesselId: r.vesselId, vesselCode: v.vesselCode, vesselName: v.vesselName, rounds: 0, voyages: 0, bookings: 0, totalTEU: 0, totalFreight: 0 };
    cur.rounds += 1; cur.voyages += r.voyages; cur.bookings += r.bookings; cur.totalTEU += r.totalTEU; cur.totalFreight += r.totalFreight;
    out.set(k, cur);
  }
  return [...out.values()]
    .map((v) => ({ ...v, totalFreight: money(v.totalFreight) }))
    .sort((a, b) => String(a.vesselName).localeCompare(String(b.vesselName)) || String(a.vesselId).localeCompare(String(b.vesselId)));
};

module.exports = { TABS, STATUSES, portFilter, roundStatusesFor, parseIncludeClosed, wantsZeroRows, rollupRounds, rollupVessels, summariseEstimated, summariseOperational, summariseByStatus, portMatch, sortRows, money };
