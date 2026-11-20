// Fixed-voyage mode of the booking forms (Voyage Details, sprint C): which ports may be picked on ONE voyage.
// Pure functions, no React. `calls` = the voyage's port calls in travel order: [{ index, legKey, portId, name, code }].
// Rules: POL defaults to the NEXT port call; if that is the last call (nothing after it) the call before it;
// POD choices are the calls AFTER the chosen POL (a different port); the voyage is never cleared.

const same = (a, b) => String(a) === String(b);

/** Position of a call from its leg key (a repeated port is told apart by the key); old data without keys falls back to the port id. */
export const callIndex = (calls, legKey, portId) => {
  if (legKey) { const i = calls.findIndex((c) => c.legKey && same(c.legKey, legKey)); if (i >= 0) return i; }
  return portId ? calls.findIndex((c) => same(c.portId, portId)) : -1;
};

/** Calls that can be a POL: every call that still has a later call. */
export const polChoices = (calls) => calls.slice(0, Math.max(0, calls.length - 1));

/** Calls that can be a POD for the chosen POL position: later calls at a different port. */
export const podChoices = (calls, polIndex) =>
  polIndex < 0 ? [] : calls.slice(polIndex + 1).filter((c) => !same(c.portId, calls[polIndex].portId));

/** Default POL position (-1 when the voyage has fewer than two calls). `nextIndex` = summary.nextPort.next?.index. */
export const defaultPolIndex = (calls, nextIndex) => {
  if (calls.length < 2) return -1;
  const last = calls.length - 1;
  if (nextIndex == null || nextIndex < 0) return 0;
  return nextIndex >= last ? last - 1 : nextIndex;
};

/** First value of the form for a fixed voyage: this round, this voyage, POL = default, POD empty. */
export const fixedRouteStart = ({ roundId, voyageId, calls, nextIndex }) => {
  const i = defaultPolIndex(calls, nextIndex);
  const pol = i >= 0 ? calls[i] : null;
  return { roundId, voyageId, polId: pol?.portId || '', polLegKey: pol?.legKey || '', podId: '', podLegKey: '' };
};

/** Client-side check of a fixed route. Returns { field: message }; the server stays the final judge. */
export const validateFixedRoute = (route, calls) => {
  const e = {};
  if (!route?.roundId || !route?.voyageId) e.voyageId = 'The voyage is missing';
  const pi = callIndex(calls, route?.polLegKey, route?.polId);
  const di = callIndex(calls, route?.podLegKey, route?.podId);
  if (pi < 0) e.polId = 'POL is required';
  if (di < 0) e.podId = 'POD is required';
  if (pi >= 0 && di >= 0 && di <= pi) e.podId = 'POD must be a later port call than the POL';
  if (pi >= 0 && di >= 0 && same(calls[pi].portId, calls[di].portId)) e.podId = 'POL and POD must differ';
  return e;
};
