'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const rbac = require('../../middleware/rbac');
const audit = require('../../middleware/auditLogger');
const svc = require('./invoiceService.service');
const { validateCreate, validateUpdate } = require('./invoiceService.validation');
const { success, created, paginate } = require('../../utils/responseHelper');

router.use(auth);

router.get('/', rbac('invoiceServices'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', applicability = '' } = req.query;
    const { data, total } = await svc.list({ page, limit, search, status, applicability });
    return success(res, data, 'Invoice services retrieved', 200, paginate(total, page, limit));
  } catch (e) { next(e); }
});
router.get('/:id', rbac('invoiceServices'), async (req, res, next) => {
  try { return success(res, await svc.getById(req.params.id)); } catch (e) { next(e); }
});
router.post('/', rbac('invoiceServices'), audit('invoiceServices'), validateCreate, async (req, res, next) => {
  try { return created(res, await svc.create(req.body, req.user._id), 'Invoice service created'); } catch (e) { next(e); }
});
router.put('/:id', rbac('invoiceServices'), audit('invoiceServices'), validateUpdate, async (req, res, next) => {
  try {
    req.auditOldDoc = await svc.getById(req.params.id);
    return success(res, await svc.update(req.params.id, req.body, req.user._id), 'Invoice service updated');
  } catch (e) { next(e); }
});
router.delete('/:id', rbac('invoiceServices'), audit('invoiceServices'), async (req, res, next) => {
  try { await svc.hardDelete(req.params.id); return success(res, null, 'Invoice service deleted'); } catch (e) { next(e); }
});

module.exports = router;
