'use strict';

// Pure round rules (RV-04/05, RV-13/14). No DB access.

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
const buildRouteSnapshot = (routeId, routeLegs, now = new Date()) => ({
  routeId,
  capturedAt: now,
  legs: [...routeLegs]
    .sort((a, b) => a.sequence - b.sequence)
    .map((l) => ({
      sequence:   l.sequence,
      countryId:  l.countryId?._id || l.countryId,
      cityId:     l.cityId?._id || l.cityId,
      portId:     l.portId?._id || l.portId,
      terminalId: l.terminalId?._id || l.terminalId || null,
      agentId:    l.agentId?._id || l.agentId || null,
      portName:   l.portId?.name || null,
      portCode:   l.portId?.code || null,
    })),
});

/** Statuses a voyage may still be moved to Cancelled from (Arrived/Completed/Cancelled are left alone). */
const CANCELLABLE_VOYAGE_STATUSES = ['Scheduled', 'Departed', 'In Transit'];

module.exports = { INITIAL_STATUSES, assertInitialStatus, buildRouteSnapshot, CANCELLABLE_VOYAGE_STATUSES };
