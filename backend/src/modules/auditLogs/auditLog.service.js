'use strict';

const AuditLog = require('./auditLog.model');
const { escapeRegex } = require('../../utils/escapeRegex');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, module = '', action = '', search = '', dateFrom = '', dateTo = '' } = {}) => {
  const query = {};
  if (module) query.module = module;
  if (action) query.action = action;
  if (search) { const rx = escapeRegex(search); query.$or = [{ userEmail: { $regex: rx, $options: 'i' } }, { recordNumber: { $regex: rx, $options: 'i' } }]; }
  if (dateFrom || dateTo) {
    query.timestamp = {};
    if (dateFrom) query.timestamp.$gte = new Date(dateFrom);
    if (dateTo)   query.timestamp.$lte = new Date(dateTo);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    AuditLog.find(query).populate('userId', 'name email').sort({ timestamp: -1 }).skip(skip).limit(Number(limit)).lean(),
    AuditLog.countDocuments(query),
  ]);
  return { data, total };
};

const getById = async (id) => {
  const log = await AuditLog.findById(id).populate('userId', 'name email').lean();
  if (!log) throw { status: 404, message: 'Audit log entry not found' };
  return log;
};

module.exports = { list, getById };
