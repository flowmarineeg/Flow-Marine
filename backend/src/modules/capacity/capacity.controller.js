'use strict';

const capacityService = require('./capacity.service');
const { success, error } = require('../../utils/responseHelper');

/**
 * GET /api/v1/capacity/round/:roundId
 * Returns full per-leg capacity payload for a specific round.
 * Optional query param: ?statuses=Confirmed,Final+Loading,Pending
 */
const getRoundCapacity = async (req, res, next) => {
  try {
    const opts = {};
    if (req.query.statuses) {
      opts.statuses = req.query.statuses.split(',').map(s => s.trim()).filter(Boolean);
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
 * Body: { roundId, polId, podId, quantity, containerTypeId }
 */
const previewCapacity = async (req, res, next) => {
  try {
    const { roundId, polId, podId, quantity, containerTypeId } = req.body;
    if (!roundId || !polId || !podId || !quantity || !containerTypeId) {
      return error(res, 'roundId, polId, podId, quantity, containerTypeId are all required', 400);
    }
    const data = await capacityService.computeSegmentPreview(roundId, polId, podId, Number(quantity), containerTypeId);
    return success(res, data, 'Segment preview computed');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

module.exports = { getRoundCapacity, getVesselActiveCapacity, previewCapacity };
