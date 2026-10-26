'use strict';

const express = require('express');
const router  = express.Router();
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const svc     = require('./customer.service');
const { validateCreate, validateUpdate } = require('./customer.validation');
const { success, created, paginate } = require('../../utils/responseHelper');

router.use(auth);

router.get('/', rbac('customers'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', customerType = '' } = req.query;
    const { data, total } = await svc.list({ page, limit, search, status, customerType });
    return success(res, data, 'Customers retrieved', 200, paginate(total, page, limit));
  } catch (e) { next(e); }
});
router.get('/:id', rbac('customers'), async (req, res, next) => {
  try { return success(res, await svc.getById(req.params.id)); } catch (e) { next(e); }
});
router.post('/', rbac('customers', 'create'), audit('customers'), validateCreate, async (req, res, next) => {
  try { return created(res, await svc.create(req.body, req.user._id), 'Customer created'); } catch (e) { next(e); }
});
router.put('/:id', rbac('customers', 'update'), audit('customers'), validateUpdate, async (req, res, next) => {
  try {
    req.auditOldDoc = await svc.getById(req.params.id);
    return success(res, await svc.update(req.params.id, req.body, req.user._id), 'Customer updated');
  } catch (e) { next(e); }
});
router.delete('/:id', rbac('customers', 'delete'), audit('customers'), async (req, res, next) => {
  try { await svc.hardDelete(req.params.id); return success(res, null, 'Customer deleted'); } catch (e) { next(e); }
});

module.exports = router;
