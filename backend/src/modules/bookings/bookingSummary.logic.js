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

module.exports = { TABS, STATUSES, portFilter, summariseEstimated, summariseOperational, summariseByStatus, portMatch, sortRows, money };
