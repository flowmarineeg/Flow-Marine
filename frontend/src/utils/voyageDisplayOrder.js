// Sprint 043 — display-only voyage ordering by physical vessel flow.
//
// Voyage.sequence already matches physical leg position for auto-generated
// voyages (one per consecutive route-leg pair), but a manually-added voyage
// (e.g. a shortcut from leg 1 straight to leg 3) always gets whatever
// sequence number comes after every voyage that already existed at the
// moment it was created — NOT its true position in the route. That means
// sorting by `sequence` alone can show a wide manual voyage AFTER a
// narrower one that the vessel actually completes first.
//
// This file does NOT touch voyage.sequence, capacity calculations, or any
// backend data — it only re-sorts a rendering-time COPY of a voyages array,
// reused by every view that needs "the order the vessel physically flows
// through the round" (Voyage Tab, Round Details -> Voyages, Capacity Engine
// tables), so the three views can never silently drift into different
// orders from each other.

/**
 * Build a Map of portId (string) -> leg sequence number from a round's
 * route legs, as returned by GET /voyages/round-ports/:roundId
 * (voyagesService.getRoundRoutePorts). If the same port appears at more
 * than one leg (a round-trip route), the FIRST (lowest-sequence)
 * occurrence wins.
 */
export const buildLegPositionMap = (routeLegs = []) => {
  const map = new Map();
  routeLegs.forEach(leg => {
    const portId = String(leg.portId?._id ?? leg.portId);
    if (!map.has(portId)) map.set(portId, leg.sequence);
  });
  return map;
};

const resolveLegPos = (legMap, portRef) => {
  const portId = String(portRef?._id ?? portRef ?? '');
  return legMap.get(portId);
};

/**
 * Sort a voyages array for DISPLAY ONLY — never mutates `voyages`, never
 * writes anything back, has no effect on any calculation elsewhere.
 *
 * Rule (Sprint 043, confirmed against the client's own example order):
 *   - Resolve each voyage's (polLegPos, podLegPos) from the round's route
 *     legs.
 *   - "Forward" voyages (podLegPos >= polLegPos) sort by podLegPos
 *     ascending, tie-broken by polLegPos descending — i.e. voyages are
 *     grouped by where they END, in the order the vessel reaches that
 *     point; within the same destination, the more direct/shorter voyage
 *     sorts first, and voyages that skipped more intermediate stops to
 *     reach the same destination sort after.
 *   - "Backward" voyages (podLegPos < polLegPos — e.g. a round-trip
 *     voyage heading back toward the route's origin) always sort AFTER
 *     every forward voyage, using the same tie-break rule among
 *     themselves.
 *   - A voyage whose POL/POD can't be resolved against the given route
 *     legs (legs not loaded yet) falls back to its own `sequence` and
 *     stays in the forward group, so nothing ever silently disappears.
 *
 * `getPol`/`getPod` let callers whose voyage objects don't use the raw
 * Voyage document's own `polId`/`podId` shape adapt them — e.g. the
 * Capacity Engine's already-computed rows use `fromPort.portId`/
 * `toPort.portId` instead. Defaults match the raw Voyage shape used by
 * the Voyage Tab and Round Details -> Voyages section.
 */
export const sortVoyagesForDisplay = (
  voyages = [], routeLegs = [],
  { getPol = (v) => v.polId, getPod = (v) => v.podId } = {}
) => {
  const legMap = buildLegPositionMap(routeLegs);

  const withPositions = voyages.map(v => {
    const polLegPos = resolveLegPos(legMap, getPol(v));
    const podLegPos = resolveLegPos(legMap, getPod(v));
    const resolved  = polLegPos != null && podLegPos != null;
    return {
      voyage:    v,
      polLegPos: resolved ? polLegPos : v.sequence,
      podLegPos: resolved ? podLegPos : (v.sequence ?? 0) + 1,
      backward:  resolved ? podLegPos < polLegPos : false,
    };
  });

  const cmp = (a, b) => {
    if (a.podLegPos !== b.podLegPos) return a.podLegPos - b.podLegPos;
    return b.polLegPos - a.polLegPos; // tie-break: descending
  };

  const forward  = withPositions.filter(x => !x.backward).sort(cmp);
  const backward = withPositions.filter(x => x.backward).sort(cmp);

  return [...forward, ...backward].map(x => x.voyage);
};
