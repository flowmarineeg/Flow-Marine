'use strict';

const roundService = require('./round.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', serviceId = '' } = req.query;
    const { data, total } = await roundService.list({ page, limit, search, status, serviceId });
    return success(res, data, 'Rounds retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await roundService.getById(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const getRoundVoyages = async (req, res, next) => {
  try {
    return success(res, await roundService.getRoundVoyages(req.params.id), 'Voyages retrieved');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const create = async (req, res, next) => {
  try {
    const result = await roundService.create(req.body, req.user._id);
    return created(res, result, 'Round created and voyages generated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const update = async (req, res, next) => {
  try {
    req.auditOldDoc = await roundService.getById(req.params.id);
    return success(res, await roundService.update(req.params.id, req.body, req.user._id), 'Round updated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const remove = async (req, res, next) => {
  try {
    await roundService.hardDelete(req.params.id);
    return success(res, null, 'Round deleted successfully');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { list, getById, getRoundVoyages, create, update, remove };
