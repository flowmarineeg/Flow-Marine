'use strict';

const vesselService = require('./vessel.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const { data, total } = await vesselService.list({ page, limit, search, status });
    return success(res, data, 'Vessels retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await vesselService.getById(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await vesselService.create(req.body, req.user._id), 'Vessel created successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const update = async (req, res, next) => {
  try {
    // Capture old doc for audit log
    req.auditOldDoc = await vesselService.getById(req.params.id);
    return success(res, await vesselService.update(req.params.id, req.body, req.user._id), 'Vessel updated successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const remove = async (req, res, next) => {
  try {
    await vesselService.softDelete(req.params.id, req.user._id);
    return success(res, null, 'Vessel deleted successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const getStats = async (req, res, next) => {
  try {
    return success(res, await vesselService.getVesselStats(req.params.id), 'Vessel stats retrieved');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { list, getById, getStats, create, update, remove };
