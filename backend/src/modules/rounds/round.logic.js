'use strict';

// Pure round rules (RV-04/05, RV-13/14). No DB access.

const crypto = require('crypto');

const INITIAL_STATUSES = ['Planned', 'Active'];

/** A round may start only Planned or Active; Completed/Cancelled are reached by transition. */
const assertInitialStatus = (status) => {
  const s = status || 'Planned';
  if (!INITIAL_STATUSES.includes(s)) {
    throw { status: 400, message: `A new round can only start as ${INITIAL_STATUSES.join(' or ')}, not "${s}"` };
  }
  return s;
};

/**
 * Route snapshot stored on the Round at creation. routeLegs are lean RouteLeg docs with portId populated
 * ({ name, code }); ids are kept so the legs stay interpretable even if the Service route is edited later.
 */
const newLegKey = () => crypto.randomBytes(5).toString('hex');

const buildRouteSnapshot = (routeId, routeLegs, now = new Date()) => ({
  routeId,
  capturedAt: now,
  legs: [...routeLegs]
    .sort((a, b) => a.sequence - b.sequence)
    .map((l) => ({
      sequence:   l.sequence,
      legKey:     l.legKey || newLegKey(),
      countryId:  l.countryId?._id || l.countryId,
      cityId:     l.cityId?._id || l.cityId,
      portId:     l.portId?._id || l.portId,
      terminalId: l.terminalId?._id || l.terminalId || null,
      agentId:    l.agentId?._id || l.agentId || null,
      portName:   l.portId?.name || null,
      portCode:   l.portId?.code || null,
    })),
});

/**
 * Legs sent by the client when a round's legs are edited (sequence = list order). A legKey is kept only if
 * it already exists on the round and is not repeated; anything else gets a fresh key.
 * ports: Map<portIdString, { name, code }> for the snapshot's portName/portCode.
 */
const buildEditedLegs = (legs, existingKeys, ports) => {
  const known = new Set(existingKeys || []);
  const used = new Set();
  return legs.map((l, idx) => {
    let key = l.legKey;
    if (!key || !known.has(key) || used.has(key)) key = newLegKey();
    used.add(key);
    const p = ports.get(String(l.portId));
    return {
      sequence: idx + 1, legKey: key,
      countryId: l.countryId, cityId: l.cityId, portId: l.portId,
      terminalId: l.terminalId || null, agentId: l.agentId || null,
      portName: p?.name || null, portCode: p?.code || null,
    };
  });
};

/** Statuses a voyage may still be moved to Cancelled from (Arrived/Completed/Cancelled are left alone). */
const CANCELLABLE_VOYAGE_STATUSES = ['Scheduled', 'Departed', 'In Transit'];

module.exports = { INITIAL_STATUSES, assertInitialStatus, buildRouteSnapshot, buildEditedLegs, newLegKey, CANCELLABLE_VOYAGE_STATUSES };
