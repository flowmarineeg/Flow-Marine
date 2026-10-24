'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./vessel.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./vessel.validation');
const partnerSvc = require('../partners/partner.service');
const { validateShares } = require('../partners/partner.validation');
const { success } = require('../../utils/responseHelper');
const { recordMoneyEvent } = require('../../utils/moneyAudit');

router.use(auth);
router.get('/',           rbac('vessels'), ctrl.list);
router.get('/:id/stats',  rbac('vessels'), ctrl.getStats);   // BEFORE /:id
// Sprint050 P6 — JV partner shares (BEFORE /:id). Flag-gated; edits need partners:manage.
router.get('/:id/partners',    rbac('vessels'), async (req, res, next) => {
  try { return success(res, await partnerSvc.getShares(req.params.id)); } catch (e) { next(e); }
});
router.put('/:id/partners',    rbac('partners', 'manage'), audit('vessels'), validateShares, async (req, res, next) => {
  try {
    const before = await partnerSvc.getShares(req.params.id);
    const saved = await partnerSvc.setShares(req.params.id, req.body.shares, req.user._id);
    recordMoneyEvent({ user: req.user, module: 'vessels', event: 'vessel.shares.set', recordId: req.params.id, before: { shares: before.map((s) => ({ partnerId: s.partnerId?._id, shareBp: s.shareBp, isLead: s.isLead })) }, after: { shares: saved.map((s) => ({ partnerId: s.partnerId?._id, shareBp: s.shareBp, isLead: s.isLead })) } });
    return success(res, saved, 'Partner shares saved');
  } catch (e) { next(e); }
});
router.delete('/:id/partners', rbac('partners', 'manage'), audit('vessels'), async (req, res, next) => {
  try { await partnerSvc.clearShares(req.params.id); return success(res, null, 'Partner shares cleared'); } catch (e) { next(e); }
});
router.get('/:id',        rbac('vessels'), ctrl.getById);
router.post('/',          rbac('vessels'), audit('vessels'), validateCreate, ctrl.create);
router.put('/:id',        rbac('vessels'), audit('vessels'), validateUpdate, ctrl.update);
router.delete('/:id',     rbac('vessels'), audit('vessels'), ctrl.remove);

module.exports = router;
