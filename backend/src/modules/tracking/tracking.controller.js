'use strict';

const trackingService = require('./tracking.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const listEntries = async (req, res, next) => {
  try {
    const { page=1, limit=15, vesselId='', voyageId='', serviceId='', status='', dateFrom='', dateTo='', search='' } = req.query;
    const { data, total } = await trackingService.listEntries({ page, limit, vesselId, voyageId, serviceId, status, dateFrom, dateTo, search });
    return success(res, data, 'Tracking entries retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const createEntry = async (req, res, next) => {
  try {
    const entry = await trackingService.createEntry(req.body, req.user._id);
    return created(res, entry, 'Tracking entry added');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const getHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const { data, total, voyage } = await trackingService.getHistory(req.params.voyageId, { page, limit });
    return success(res, { entries: data, voyage }, 'Tracking history retrieved', 200, paginate(total, page, limit));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const getLatestPositions = async (req, res, next) => {
  try {
    return success(res, await trackingService.getLatestPositions(), 'Latest positions retrieved');
  } catch (err) { next(err); }
};

module.exports = { listEntries, createEntry, getHistory, getLatestPositions };
