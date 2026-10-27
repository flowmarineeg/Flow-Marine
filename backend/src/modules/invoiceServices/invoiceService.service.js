'use strict';

const pickFields = require('../../utils/pickFields');
const AppError = require('../../utils/AppError');
const InvoiceService = require('./invoiceService.model');
const { escapeRegex } = require('../../utils/escapeRegex');
const { assertAccountFor } = require('../ledger/accountRules');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '', applicability = '' } = {}) => {
  const q = {};
  if (status) q.status = status;
  if (applicability) q.applicability = applicability;
  if (search) q.serviceName = { $regex: escapeRegex(search), $options: 'i' };
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    InvoiceService.find(q).populate('revenueAccountId', 'code name').sort({ serviceName: 1 }).skip(skip).limit(Number(limit)).lean(),
    InvoiceService.countDocuments(q),
  ]);
  return { data, total };
};

const getById = async (id) => {
  const s = await InvoiceService.findById(id).populate('revenueAccountId', 'code name').lean();
  if (!s) throw new AppError(404, 'Invoice service not found', 'INVOICE_SERVICE_NOT_FOUND');
  return s;
};

const assertNameFree = async (name, exceptId = null) => {
  const q = { serviceName: new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i') };
  if (exceptId) q._id = { $ne: exceptId };
  if (await InvoiceService.exists(q)) throw new AppError(400, `Invoice service "${name}" already exists`, 'DUPLICATE_NAME');
};

const create = async (data, createdBy) => {
  await assertNameFree(data.serviceName);
  await assertAccountFor(data.revenueAccountId, 'revenue', 'Revenue account');
  const doc = await InvoiceService.create({ ...pickFields(InvoiceService, data), createdBy });
  return doc.toObject();
};

const update = async (id, data, updatedBy) => {
  const s = await InvoiceService.findById(id);
  if (!s) throw new AppError(404, 'Invoice service not found', 'INVOICE_SERVICE_NOT_FOUND');
  if (data.serviceName && data.serviceName.trim().toLowerCase() !== s.serviceName.toLowerCase()) await assertNameFree(data.serviceName, id);
  if (data.revenueAccountId) await assertAccountFor(data.revenueAccountId, 'revenue', 'Revenue account');
  Object.assign(s, { ...pickFields(InvoiceService, data), updatedBy });
  await s.save();
  return s.toObject();
};

const hardDelete = async (id) => {
  const s = await InvoiceService.findById(id);
  if (!s) throw new AppError(404, 'Invoice service not found', 'INVOICE_SERVICE_NOT_FOUND');
  await InvoiceService.findByIdAndDelete(id);
};

module.exports = { list, getById, create, update, hardDelete };
