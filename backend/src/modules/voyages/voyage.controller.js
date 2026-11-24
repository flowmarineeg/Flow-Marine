'use strict';

const voyageService = require('./voyage.service');
const voyageSummary = require('./voyageSummary.service');
const vesselOverviewService = require('./vesselOverview.service');
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

// GET /voyages/:id  (Voyage Details: also the vessel, round dates and named port calls)
const getById = async (req, res, next) => {
  try {
    return success(res, await voyageService.getDetail(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// GET /voyages/:id/summary  — cards for the Voyage Details page (revenue only with invoices:read or reports:read)
const summary = async (req, res, next) => {
  try {
    const canSeeRevenue = (await rbac.hasPermission(req, 'invoices', 'read')) || (await rbac.hasPermission(req, 'reports', 'read'));
    return success(res, await voyageSummary.getSummary(req.params.id, { canSeeRevenue }), 'Voyage summary retrieved');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// GET /voyages/vessel-overview  — Voyages page level 1: vessels with an open round and an open voyage
const vesselOverview = async (req, res, next) => {
  try {
    const { data, total, page, limit } = await vesselOverviewService.vesselList(req.query);
    return success(res, data, 'Vessels retrieved', 200, paginate(total, page, limit));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// GET /voyages/vessel-overview/:vesselId  — level 2: that vessel's open rounds and voyages
const vesselOverviewDetail = async (req, res, next) => {
  try {
    return success(res, await vesselOverviewService.vesselDetail(req.params.vesselId), 'Vessel voyages retrieved');
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
    const voyage = await voyageService.createVoyage(roundId, rest, req.user._id);
    return created(res, voyage, 'Voyage created');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// POST /voyages/:id/refresh-port-calls — rebuild port calls from the round's current legs
const refreshPortCalls = async (req, res, next) => {
  try {
    return success(res, await voyageService.refreshPortCalls(req.params.id, req.user._id), 'Port calls refreshed');
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

module.exports = { list, vesselOverview, vesselOverviewDetail, getById, summary, getRoundRoutePorts, create, refreshPortCalls, update, remove };
