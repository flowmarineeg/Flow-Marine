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

module.exports = { TABS, summariseEstimated, summariseOperational, sortRows, money };
