'use strict';

const manualBookingService = require('./manualBooking.service');
const { scopeOf } = require('./partnerScope');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const fail = (res, next, err) => (err && err.status ? error(res, err.message, err.status, err.errors || []) : next(err));

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', voyageId = '', agentId = '', roundId = '', partnerId = '', status = '' } = req.query;
    const { data, total } = await manualBookingService.list({ page, limit, search, voyageId, agentId, roundId, partnerId, status }, scopeOf(req.user));
    return success(res, data, 'Manual bookings retrieved', 200, paginate(total, page, limit));
  } catch (err) { fail(res, next, err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await manualBookingService.getById(req.params.id, scopeOf(req.user)));
  } catch (err) { fail(res, next, err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await manualBookingService.create(req.body, req.user._id, scopeOf(req.user)), 'Manual booking created');
  } catch (err) { fail(res, next, err); }
};

const update = async (req, res, next) => {
  try {
    const scope = scopeOf(req.user);
    req.auditOldDoc = await manualBookingService.getById(req.params.id, scope);
    return success(res, await manualBookingService.update(req.params.id, req.body, req.user._id, scope), 'Manual booking updated');
  } catch (err) { fail(res, next, err); }
};

const remove = async (req, res, next) => {
  try {
    await manualBookingService.hardDelete(req.params.id, scopeOf(req.user));
    return success(res, null, 'Manual booking deleted');
  } catch (err) { fail(res, next, err); }
};

module.exports = { list, getById, create, update, remove };
