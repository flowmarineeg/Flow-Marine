'use strict';

const paymentService = require('./payment.service');
const { success, created, error, paginate } = require('../../utils/responseHelper');

// ─── Agent Details "Payments" tab ─────────────────────────────────────────────
const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, agentId = '' } = req.query;
    const { data, total } = await paymentService.list({ page, limit, agentId });
    return success(res, data, 'Payments retrieved', 200, paginate(total, page, limit));
  } catch (err) { next(err); }
};

// ─── Invoice Detail payment history ───────────────────────────────────────────
const listForInvoice = async (req, res, next) => {
  try {
    return success(res, await paymentService.listForInvoice(req.params.id));
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await paymentService.create(req.params.id, req.body, req.user._id), 'Payment recorded');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

const voidPayment = async (req, res, next) => {
  try {
    return success(res, await paymentService.voidPayment(req.params.id, req.params.paymentId, req.body, req.user._id), 'Payment voided');
  } catch (err) { if (err.status) return error(res, err.message, err.status); next(err); }
};

module.exports = { list, listForInvoice, create, voidPayment };
