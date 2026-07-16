'use strict';

const express  = require('express');
const router   = express.Router();
const service  = require('./auditLog.service');
const auth     = require('../../middleware/auth');
const rbac     = require('../../middleware/rbac');
const { success, error, paginate } = require('../../utils/responseHelper');

router.use(auth);

router.get('/', rbac('auditLogs'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, module, action, search, dateFrom, dateTo } = req.query;
    const { data, total } = await service.list({ page, limit, module, action, search, dateFrom, dateTo });
    return success(res, data, 'Audit logs retrieved', 200, paginate(total, page, limit));
  } catch (e) { next(e); }
});

router.get('/:id', rbac('auditLogs'), async (req, res, next) => {
  try {
    const log = await service.getById(req.params.id);
    return success(res, log);
  } catch (e) { if (e.status) return error(res, e.message, e.status); next(e); }
});

module.exports = router;
