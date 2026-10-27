'use strict';

const express = require('express');
const router  = express.Router();
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const { hasPermission } = rbac;
const audit   = require('../../middleware/auditLogger');
const svc     = require('./partner.service');
const { validateCreate, validateUpdate } = require('./partner.validation');
const { success, created, paginate } = require('../../utils/responseHelper');

router.use(auth);

// Bank details are sensitive: only partners:manage holders get them back.
const redactBank = async (req, data) => {
  if (await hasPermission(req, 'partners', 'manage')) return data;
  const strip = (p) => { const { bank, bankAccounts, ...rest } = p; return rest; }; // eslint-disable-line no-unused-vars
  return Array.isArray(data) ? data.map(strip) : strip(data);
};

router.get('/', rbac('partners'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const { data, total } = await svc.list({ page, limit, search, status });
    return success(res, await redactBank(req, data), 'Partners retrieved', 200, paginate(total, page, limit));
  } catch (e) { next(e); }
});
router.get('/:id', rbac('partners'), async (req, res, next) => {
  try { return success(res, await redactBank(req, await svc.getById(req.params.id))); } catch (e) { next(e); }
});
router.post('/', rbac('partners', 'manage'), audit('partners'), validateCreate, async (req, res, next) => {
  try { return created(res, await svc.create(req.body, req.user._id), 'Partner created'); } catch (e) { next(e); }
});
router.put('/:id', rbac('partners', 'manage'), audit('partners'), validateUpdate, async (req, res, next) => {
  try {
    req.auditOldDoc = await svc.getById(req.params.id);
    return success(res, await svc.update(req.params.id, req.body, req.user._id), 'Partner updated');
  } catch (e) { next(e); }
});
router.delete('/:id', rbac('partners', 'manage'), audit('partners'), async (req, res, next) => {
  try { await svc.hardDelete(req.params.id); return success(res, null, 'Partner deleted'); } catch (e) { next(e); }
});

module.exports = router;
