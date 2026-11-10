'use strict';

// Pure per-leg capacity maths (bookings sprint follow-up 2026-11-10, replaces the old one-row-per-voyage chain, FL-01).
// No DB access. A voyage is one run; its `portCalls` give the ports in travel order, so the run has
// (portCalls.length - 1) SEGMENTS (port i -> port i+1). A booking from POL to POD occupies the segments between the
// two calls: cargo is aboard on every segment it sails, not only "at" the loading voyage. Both layers count.

const { matchRun } = require('../bookings/voyageMatch.logic');

const sid = (v) => String(v?._id || v || '');

/**
 * Position of a booking inside its voyage's run: { polIdx, podIdx } or null.
 * The stored leg keys win when they still name the same ports; otherwise (older bookings, edited legs) the ports decide.
 */
const spanOf = (portCalls, b) => {
  const calls = portCalls || [];
  if (b.polLegKey && b.podLegKey) {
    const i = calls.findIndex((c) => c.legKey === b.polLegKey);
    const j = calls.findIndex((c) => c.legKey === b.podLegKey);
    if (i >= 0 && j > i && sid(calls[i].portId) === sid(b.polId) && sid(calls[j].portId) === sid(b.podId)) return { polIdx: i, podIdx: j };
  }
  if (!b.polId || !b.podId) return null;
  const m = matchRun(calls, b.polId, b.podId);
  return m ? { polIdx: m.polIdx, podIdx: m.podIdx } : null;
};

const portView = (c) => ({ portId: sid(c.portId), name: c.portName || '', code: c.portCode || '', legKey: c.legKey || null });

/**
 * One voyage. events: [{ polIdx, podIdx, teu, layer: 'l1'|'l2', stuckRemaining? }]
 * A stuckRemaining event (discharge import said it did not leave) stays aboard on every segment after its POD.
 * Returns { segments[], ports[], loaded, discharged, peakOnboard, loadedL1, loadedL2, dischargedL1, dischargedL2,
 *           remainingOnboardAt: {portIdx: teu} }.
 */
const voyageSegments = (portCalls, events, cap) => {
  const calls = portCalls || [];
  const n = Math.max(calls.length - 1, 0);
  const onboard = new Array(n).fill(0);
  const onL1 = new Array(n).fill(0);
  const onL2 = new Array(n).fill(0);
  const loadedAt = new Array(calls.length).fill(0);
  const dischargedAt = new Array(calls.length).fill(0);
  const remainingOnboardAt = {};
  let loadedL1 = 0; let loadedL2 = 0; let dischargedL1 = 0; let dischargedL2 = 0;

  for (const e of events) {
    const to = e.stuckRemaining ? n : e.podIdx; // exclusive end segment
    for (let s = e.polIdx; s < to; s++) {
      onboard[s] += e.teu;
      if (e.layer === 'l1') onL1[s] += e.teu; else onL2[s] += e.teu;
    }
    loadedAt[e.polIdx] += e.teu;
    if (e.layer === 'l1') loadedL1 += e.teu; else loadedL2 += e.teu;
    if (e.stuckRemaining) {
      remainingOnboardAt[e.podIdx] = (remainingOnboardAt[e.podIdx] || 0) + e.teu;
    } else {
      dischargedAt[e.podIdx] += e.teu;
      if (e.layer === 'l1') dischargedL1 += e.teu; else dischargedL2 += e.teu;
    }
  }

  const segments = [];
  for (let s = 0; s < n; s++) {
    segments.push({
      index: s,
      fromPort: portView(calls[s]), toPort: portView(calls[s + 1]),
      loadedTEU: loadedAt[s],            // loaded at the segment's start port
      dischargedTEU: dischargedAt[s + 1], // discharged on arrival at the segment's end port
      onboardTEU: onboard[s],
      remainingTEU: cap != null ? cap - onboard[s] : null,
      utilisationPct: cap != null && cap > 0 ? Math.round((onboard[s] / cap) * 100) : null,
      layer1: { onboardTEU: onL1[s] },
      layer2: { onboardTEU: onL2[s] },
    });
  }
  const ports = calls.map((c, i) => ({ ...portView(c), index: i, loadedTEU: loadedAt[i], dischargedTEU: dischargedAt[i] }));
  const loaded = loadedAt.reduce((a, b) => a + b, 0);
  const discharged = dischargedAt.reduce((a, b) => a + b, 0);
  return {
    segments, ports, loaded, discharged,
    peakOnboard: onboard.length ? Math.max(...onboard) : 0,
    loadedL1, loadedL2, dischargedL1, dischargedL2, remainingOnboardAt,
  };
};

/**
 * Would `addedTEU` more fit on every segment between POL and POD of this voyage?
 * segments: the voyage row's segments; ports: the voyage row's ports (same order as portCalls).
 * polId / podId optional: missing = the whole run. Returns null when the span cannot be found.
 */
const previewSpan = ({ segments, ports }, { polId, podId, polLegKey, podLegKey }, addedTEU, cap) => {
  let from = 0; let to = segments.length; // [from, to)
  if (polId && podId) {
    const m = spanOf(ports.map((p) => ({ legKey: p.legKey, portId: p.portId })), { polId, podId, polLegKey, podLegKey });
    if (!m) return null;
    from = m.polIdx; to = m.podIdx;
  }
  const range = segments.slice(from, to);
  if (!range.length) return null;
  let worst = range[0];
  for (const s of range) if (s.onboardTEU > worst.onboardTEU) worst = s;
  const onboardAfter = worst.onboardTEU + addedTEU;
  const remainingAfter = cap != null ? cap - onboardAfter : null;
  return {
    canFit: remainingAfter == null || remainingAfter >= 0,
    worst, onboardBefore: worst.onboardTEU, onboardAfter, remainingAfter,
    utilisationAfter: cap ? Math.round((onboardAfter / cap) * 100) : null,
    segmentCount: range.length,
  };
};

module.exports = { spanOf, voyageSegments, previewSpan };
