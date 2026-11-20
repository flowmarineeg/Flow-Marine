'use strict';

// Pure logic of the Voyage Details summary (no DB, no I/O). The numbers themselves come from the existing code:
// capacity engine (TEU), bookingSummary.voyageStatusTotals (counts, freight, per-status TEU), one invoiced aggregate.
// This file only assembles them, per docs/05-voyage-details-plan.md section 2 and 3.4.

const { STATUSES, money } = require('../bookings/bookingSummary.logic');

// Owner decision: Estimated TEU = Layer 1 not Cancelled; Operational TEU = Layer 2 Pending / Confirmed / Final Loading.
const LIVE = Object.freeze(['Pending', 'Confirmed', 'Final Loading']);

const sum = (byStatus, statuses, field) => statuses.reduce((n, s) => n + (byStatus?.[s]?.[field] || 0), 0);

/**
 * Bookings card: a count per status for each layer; the chips always add up to the totals.
 * `allocation` (optional) = per-status totals of the Layer 1 allocations; they are PART of `estimated`, so the total never changes.
 */
const bookingsCard = (estimated, operational, allocation) => {
  const layer = (by) => ({
    total: sum(by, STATUSES, 'bookings'),
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, by?.[s]?.bookings || 0])),
  });
  const e = layer(estimated); const o = layer(operational);
  e.ofWhichAllocation = sum(allocation, STATUSES, 'bookings'); // all statuses, like the chips
  return { total: e.total + o.total, estimated: e, operational: o };
};

/**
 * TEU card. Values come from the capacity engine row (`row` = that voyage's row, or null: a Cancelled voyage has no row).
 * `notPlaced` = TEU of live bookings that the engine could not place on the run (old or edited data), never negative.
 */
const teuCard = (estimated, operational, row, allocation) => {
  const capEst = row?.layer1?.loadedTEU || 0;
  const capOp = row?.layer2?.loadedTEU || 0;
  const bookEst = sum(estimated, LIVE, 'teu');
  const bookOp = sum(operational, LIVE, 'teu');
  return {
    estimated: capEst,
    // of which allocation: live (not Cancelled) allocation TEU from the bookings, shown as a sub-line of Estimated; never above it
    ofWhichAllocation: Math.min(capEst, sum(allocation, LIVE, 'teu')),
    operational: capOp,
    notPlaced: Math.max(0, bookEst - capEst) + Math.max(0, bookOp - capOp),
    capacityTEU: row ? (row.capacityBeforeLoading ?? null) : null,
    peakOnboardTEU: row ? (row.onboardTEU ?? 0) : null,
    utilisationPct: row ? (row.utilisationPct ?? null) : null,
  };
};

/**
 * Revenue card (USD). Estimated = Layer 1 not Cancelled; Operational = Layer 2 Final Loading only (same as the revenue
 * reports); Pipeline = Layer 2 Pending and Confirmed shown separately; Invoiced = issued invoice lines, gross before notes.
 */
const revenueCard = (estimated, operational, invoiced, allocation) => ({
  currency: 'USD',
  estimated: money(sum(estimated, LIVE, 'freight')),
  ofWhichAllocation: money(sum(allocation, LIVE, 'freight')),
  operational: money(operational?.['Final Loading']?.freight || 0),
  pipeline: { pending: money(operational?.Pending?.freight || 0), confirmed: money(operational?.Confirmed?.freight || 0) },
  invoiced: { amount: money(invoiced?.amount || 0), invoices: invoiced?.invoices || 0, grossBeforeNotes: true },
});

/** Drop the revenue block for users without invoices:read or reports:read. */
const shapeForPermissions = (summary, canSeeRevenue) => {
  if (canSeeRevenue) return summary;
  const { revenue, ...rest } = summary; // eslint-disable-line no-unused-vars
  return rest;
};

/**
 * Quick actions are allowed only when this returns { canBook: true }. Voyage state is checked first, then the round
 * (closed, or Cancelled/Completed = not bookable, same as roundLock.assertRoundBookable).
 */
const canBook = ({ voyageStatus, roundStatus, closeStatus }) => {
  if (voyageStatus === 'Cancelled') return { canBook: false, reason: 'VOYAGE_CANCELLED' };
  if (voyageStatus === 'Completed') return { canBook: false, reason: 'VOYAGE_COMPLETED' };
  if (closeStatus === 'Closed') return { canBook: false, reason: 'ROUND_CLOSED' };
  if (['Cancelled', 'Completed'].includes(roundStatus)) return { canBook: false, reason: 'ROUND_NOT_BOOKABLE' };
  return { canBook: true, reason: null };
};

const AT_PORT = ['At Port', 'Arrived', 'Anchored', 'Delayed'];

const view = (c, index) => (c ? { index, legKey: c.legKey || null, portId: String(c.portId), name: c.portName || '', code: c.portCode || '' } : null);

/**
 * Next port call and the strip states (table in the plan, 3.4). It is an ESTIMATE: it uses the voyage status, the port
 * order and the TrackingHistory records (oldest first), never per-port actual times (those do not exist yet).
 *   calls    = voyage.portCalls in travel order [{legKey, portId, portName, portCode, eta, etd}]
 *   tracking = [{portId, status, lastUpdate}] oldest first
 * A repeated port is matched to the first call at or after the last known index, so the position never goes backwards.
 * Returns { nextPort, ports[] }.
 */
const nextPort = ({ calls = [], voyageStatus, tracking = [] }) => {
  const n = calls.length;
  let state = 'unknown'; let cur = null; let next = null; let source = 'status'; let last = null;

  if (!n) return { nextPort: { state, current: null, next: null, source, lastTracking: null, isEstimate: true }, ports: [] };

  if (voyageStatus === 'Scheduled') { state = 'not-started'; next = 0; }
  else if (voyageStatus === 'Arrived' || voyageStatus === 'Completed') { state = 'finished'; cur = n - 1; }
  else if (voyageStatus === 'Cancelled') { state = 'finished'; }
  else {
    // Departed / In Transit: walk the tracking records to find where the vessel last was
    let idx = 0; let hit = null;
    for (const t of tracking) {
      let i = -1;
      for (let k = idx; k < n; k++) { if (String(calls[k].portId) === String(t.portId)) { i = k; break; } }
      if (i < 0) continue; // a port that is not on this run is ignored
      idx = i; hit = { index: i, status: t.status, portId: String(t.portId), lastUpdate: t.lastUpdate };
    }
    if (!hit) { state = 'underway'; next = n > 1 ? 1 : null; } // assume it has left the first port
    else {
      last = { portId: hit.portId, status: hit.status, lastUpdate: hit.lastUpdate };
      source = 'tracking';
      if (AT_PORT.includes(hit.status)) { state = 'at-port'; cur = hit.index; next = hit.index + 1 < n ? hit.index + 1 : null; }
      else { state = 'underway'; next = hit.index + 1 < n ? hit.index + 1 : null; } // Departed / In Transit from that port
    }
  }

  const ports = calls.map((c, i) => {
    let st = 'upcoming';
    if (state === 'finished') st = voyageStatus === 'Cancelled' ? 'upcoming' : (i < n - 1 ? 'done' : 'current');
    else if (i === cur) st = 'current';
    else if (i === next) st = 'next';
    else if (state === 'at-port' ? i < cur : (next != null ? i < next : i < n)) st = 'done';
    return { index: i, legKey: calls[i].legKey || null, portId: String(calls[i].portId), name: calls[i].portName || '', code: calls[i].portCode || '',
             eta: calls[i].eta || null, etd: calls[i].etd || null, state: st };
  });

  return {
    nextPort: {
      state,
      current: cur != null ? view(calls[cur], cur) : null,
      next: next != null ? { ...view(calls[next], next), eta: calls[next].eta || null } : null,
      source,
      lastTracking: last,
      isEstimate: true,
    },
    ports,
  };
};

module.exports = { LIVE, bookingsCard, teuCard, revenueCard, shapeForPermissions, canBook, nextPort };
