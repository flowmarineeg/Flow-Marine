'use strict';

const expenseService = require('./expense.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, roundId = '', voyageId = '', portId = '', expenseTypeId = '', currency = '', dateFrom = '', dateTo = '' } = req.query;
    const { data, total } = await expenseService.list({ page, limit, roundId, voyageId, portId, expenseTypeId, currency, dateFrom, dateTo });
    return success(res, data, 'Expenses retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    return success(res, await expenseService.getById(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

// Sprint020: authenticated file download — replaces public /uploads static route
const getAttachment = async (req, res, next) => {
  try {
    const { absPath, originalName, mimetype } = await expenseService.getAttachmentPath(req.params.id);
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    res.sendFile(absPath);
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await expenseService.create(req.body, req.file, req.user._id), 'Expense created');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const update = async (req, res, next) => {
  try {
    req.auditOldDoc = await expenseService.getById(req.params.id);
    return success(res, await expenseService.update(req.params.id, req.body, req.file, req.user._id), 'Expense updated');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const remove = async (req, res, next) => {
  try {
    await expenseService.hardDelete(req.params.id);
    return success(res, null, 'Expense deleted');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { list, getById, getAttachment, create, update, remove };
