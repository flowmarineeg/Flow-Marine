'use strict';

const manualBookingService = require('./manualBooking.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', voyageId = '', agentId = '', status = '' } = req.query;
    const { data, total } = await manualBookingService.list({ page, limit, search, voyageId, agentId, status });
    return success(res, data, 'Manual bookings retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await manualBookingService.getById(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await manualBookingService.create(req.body, req.user._id), 'Manual booking created');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const update = async (req, res, next) => {
  try {
    req.auditOldDoc = await manualBookingService.getById(req.params.id);
    return success(res, await manualBookingService.update(req.params.id, req.body, req.user._id), 'Manual booking updated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const remove = async (req, res, next) => {
  try {
    await manualBookingService.hardDelete(req.params.id);
    return success(res, null, 'Manual booking deleted');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { list, getById, create, update, remove };
