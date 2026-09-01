'use strict';

const voyageService = require('./voyage.service');
const rbac = require('../../middleware/rbac');
const { success, created, error, paginate } = require('../../utils/responseHelper');

// GET /voyages
const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, roundId = '', serviceId = '', status = '', polId = '', podId = '' } = req.query;
    const { data, total } = await voyageService.list({ page, limit, roundId, serviceId, status, polId, podId });
    return success(res, data, 'Voyages retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

// GET /voyages/:id
const getById = async (req, res, next) => {
  try {
    return success(res, await voyageService.getById(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// GET /voyages/round-ports/:roundId  — ports available for manual voyage creation
const getRoundRoutePorts = async (req, res, next) => {
  try {
    const ports = await voyageService.getRoundRoutePorts(req.params.roundId);
    return success(res, ports, 'Route ports retrieved');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// POST /voyages  — manual voyage creation
const create = async (req, res, next) => {
  try {
    const { roundId, ...rest } = req.body;
    const voyage = await voyageService.createManualVoyage(roundId, rest, req.user._id);
    return created(res, voyage, 'Voyage created');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// PUT /voyages/:id
const update = async (req, res, next) => {
  try {
    req.auditOldDoc = await voyageService.getById(req.params.id);
    // An additive capability on top of the base rbac('voyages') gate already
    // applied at the route level, not a replacement for it — same pattern as
    // invoice.controller.js's invoices:override (Sprint 046).
    const canOverride = await rbac.hasPermission(req, 'voyages', 'override');
    return success(res, await voyageService.update(req.params.id, req.body, req.user._id, canOverride), 'Voyage updated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// DELETE /voyages/:id
const remove = async (req, res, next) => {
  try {
    await voyageService.deleteVoyage(req.params.id);
    return success(res, null, 'Voyage deleted');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { list, getById, getRoundRoutePorts, create, update, remove };
