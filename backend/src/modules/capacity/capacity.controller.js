'use strict';

const capacityService = require('./capacity.service');
const { success, error } = require('../../utils/responseHelper');

/**
 * GET /api/v1/capacity/round/:roundId
 * Returns full per-leg capacity payload for a specific round.
 * Optional query param: ?statuses=Confirmed,Final+Loading,Pending
 */
const ALLOWED_CAPACITY_STATUSES = ['Pending', 'Confirmed', 'Final Loading'];

const getRoundCapacity = async (req, res, next) => {
  try {
    const opts = {};
    if (req.query.statuses) {
      const requested = req.query.statuses.split(',').map(s => s.trim()).filter(Boolean);
      const invalid = requested.filter(s => !ALLOWED_CAPACITY_STATUSES.includes(s));
      if (invalid.length > 0) {
        return error(res, `Invalid statuses for capacity filter: ${invalid.join(', ')}. Allowed: ${ALLOWED_CAPACITY_STATUSES.join(', ')}`, 400);
      }
      opts.statuses = requested;
    }
    const data = await capacityService.computeRoundCapacity(req.params.roundId, opts);
    return success(res, data, 'Round capacity computed');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

/**
 * GET /api/v1/capacity/vessel/:vesselId/active
 * Returns capacity data for the vessel's current Active round only.
 * activeRound is null when no Active round exists.
 */
const getVesselActiveCapacity = async (req, res, next) => {
  try {
    const data = await capacityService.computeVesselActiveCapacity(req.params.vesselId);
    return success(res, data, 'Vessel active capacity retrieved');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

/**
 * POST /api/v1/capacity/preview
 * Phase 4 — pre-flight capacity check for a prospective booking.
 * Body: { roundId, voyageId, containerTypeId, podId? }
 * podId is optional — when provided, all transited voyages are checked.
 */
const previewCapacity = async (req, res, next) => {
  try {
    const { roundId, voyageId, containerTypeId, podId } = req.body;
    if (!roundId || !voyageId || !containerTypeId) {
      return error(res, 'roundId, voyageId, containerTypeId are required', 400);
    }
    const data = await capacityService.computeVoyagePreview(roundId, voyageId, containerTypeId, podId);
    return success(res, data, 'Voyage preview computed');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

module.exports = { getRoundCapacity, getVesselActiveCapacity, previewCapacity };
