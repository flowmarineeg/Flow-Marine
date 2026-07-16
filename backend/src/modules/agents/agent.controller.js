'use strict';

const agentService = require('./agent.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const { data, total } = await agentService.list({ page, limit, search, status });
    return success(res, data, 'Agents retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await agentService.getById(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await agentService.create(req.body, req.user._id), 'Agent created successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const update = async (req, res, next) => {
  try {
    req.auditOldDoc = await agentService.getById(req.params.id);
    return success(res, await agentService.update(req.params.id, req.body, req.user._id), 'Agent updated successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const remove = async (req, res, next) => {
  try {
    await agentService.softDelete(req.params.id, req.user._id);
    return success(res, null, 'Agent deleted successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { list, getById, create, update, remove };
