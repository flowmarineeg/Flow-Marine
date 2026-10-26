'use strict';

const pickFields = require('../../utils/pickFields');
const AppError = require('../../utils/AppError');
const Customer = require('./customer.model');
const { buildListQuery } = require('./customer.logic');
const { assertNoDependents, DEPENDENTS } = require('../../utils/dependents');
const { assertAccountFor } = require('../ledger/accountRules');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '', customerType = '' } = {}) => {
  const query = buildListQuery({ search, status, customerType });
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    Customer.find(query).sort({ customerName: 1 }).skip(skip).limit(Number(limit)).lean(),
    Customer.countDocuments(query),
  ]);
  return { data, total };
};

const getById = async (id) => {
  const c = await Customer.findById(id).lean();
  if (!c) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  return c;
};

const assertCodeFree = async (code, exceptId = null) => {
  const q = { customerCode: String(code).toUpperCase() };
  if (exceptId) q._id = { $ne: exceptId };
  if (await Customer.exists(q)) throw new AppError(400, `Customer code "${code}" already exists`, 'DUPLICATE_CODE');
};

const create = async (data, createdBy) => {
  await assertCodeFree(data.customerCode);
  if (data.arAccountId) await assertAccountFor(data.arAccountId, 'receivable', 'AR account');
  const doc = await Customer.create({ ...pickFields(Customer, data), createdBy });
  return doc.toObject();
};

const update = async (id, data, updatedBy) => {
  const c = await Customer.findById(id);
  if (!c) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  if (data.customerCode && String(data.customerCode).toUpperCase() !== c.customerCode) await assertCodeFree(data.customerCode, id);
  if (data.arAccountId) await assertAccountFor(data.arAccountId, 'receivable', 'AR account');
  Object.assign(c, { ...pickFields(Customer, data), updatedBy });
  await c.save();
  return c.toObject();
};

const hardDelete = async (id) => {
  const c = await Customer.findById(id);
  if (!c) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  await assertNoDependents('customer', id, DEPENDENTS.customer);
  await Customer.findByIdAndDelete(id);
};

module.exports = { list, getById, create, update, hardDelete };
