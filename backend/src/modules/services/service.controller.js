'use strict';

const serviceService = require('./service.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const { data, total } = await serviceService.list({ page, limit, search, status });
    return success(res, data, 'Services retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await serviceService.getById(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await serviceService.create(req.body, req.user._id), 'Service created successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const update = async (req, res, next) => {
  try {
    req.auditOldDoc = await serviceService.getById(req.params.id);
    return success(res, await serviceService.update(req.params.id, req.body, req.user._id), 'Service updated successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const remove = async (req, res, next) => {
  try {
    await serviceService.softDelete(req.params.id, req.user._id);
    return success(res, null, 'Service deleted successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const listActive = async (req, res, next) => {
  try {
    return success(res, await serviceService.listActive(), 'Active services retrieved');
  } catch (err) { next(err); }
};

module.exports = { list, getById, create, update, remove, listActive };
