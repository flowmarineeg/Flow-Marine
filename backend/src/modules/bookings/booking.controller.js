'use strict';

const bookingService = require('./booking.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', voyageId = '', agentId = '', status = '', dateFrom = '', dateTo = '' } = req.query;
    const { data, total } = await bookingService.list({ page, limit, search, voyageId, agentId, status, dateFrom, dateTo });
    return success(res, data, 'Bookings retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await bookingService.getById(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const getVoyagePorts = async (req, res, next) => {
  try {
    return success(res, await bookingService.getVoyagePorts(req.params.voyageId), 'Voyage ports retrieved');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await bookingService.create(req.body, req.user._id), 'Booking created');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const update = async (req, res, next) => {
  try {
    req.auditOldDoc = await bookingService.getById(req.params.id);
    return success(res, await bookingService.update(req.params.id, req.body, req.user._id), 'Booking updated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const remove = async (req, res, next) => {
  try {
    await bookingService.softDelete(req.params.id, req.user._id);
    return success(res, null, 'Booking deleted');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// ─── Sprint 027: Export Discharge List ───────────────────────────────────────
const exportDischargeList = async (req, res, next) => {
  try {
    const { voyageId, agentId } = req.query;
    if (!voyageId || !agentId) {
      return error(res, 'voyageId and agentId are required', 400);
    }
    const { buffer, filename, count } = await bookingService.exportDischargeList(voyageId, agentId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Count', String(count));
    res.end(Buffer.from(buffer));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { list, getById, getVoyagePorts, create, update, remove, exportDischargeList };
