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
const { pdfUpload } = require('../../middleware/upload');
const vesselService = require('./vessel.service');
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
    recordMoneyEvent({ user: req.user, module: 'vessels', event: 'vessel.shares.set', recordId: req.params.id, before: { shares: before.map((s) => ({ partnerId: s.partnerId?._id, shareBp: s.shareBp })) }, after: { shares: saved.map((s) => ({ partnerId: s.partnerId?._id, shareBp: s.shareBp })) } });
    return success(res, saved, 'Partner shares saved');
  } catch (e) { next(e); }
});
router.delete('/:id/partners', rbac('partners', 'manage'), audit('vessels'), async (req, res, next) => {
  try { await partnerSvc.clearShares(req.params.id); return success(res, null, 'Partner shares cleared'); } catch (e) { next(e); }
});
// Particulars PDF (authenticated download; BEFORE /:id)
router.get('/:id/particulars', rbac('vessels'), async (req, res, next) => {
  try {
    const { absPath, originalName } = await vesselService.getParticularsPath(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    res.sendFile(absPath);
  } catch (e) { if (e.status) return res.status(e.status).json({ success: false, message: e.message }); next(e); }
});
router.post('/:id/particulars', rbac('vessels'), pdfUpload('vessels', 'file'), audit('vessels'), async (req, res, next) => {
  try { return success(res, await vesselService.setParticulars(req.params.id, req.file, req.user._id), 'Particulars file saved'); }
  catch (e) { if (e.status) return res.status(e.status).json({ success: false, message: e.message }); next(e); }
});
router.delete('/:id/particulars', rbac('vessels'), audit('vessels'), async (req, res, next) => {
  try { return success(res, await vesselService.clearParticulars(req.params.id, req.user._id), 'Particulars file removed'); }
  catch (e) { if (e.status) return res.status(e.status).json({ success: false, message: e.message }); next(e); }
});
router.get('/:id',        rbac('vessels'), ctrl.getById);
router.post('/',          rbac('vessels'), audit('vessels'), validateCreate, ctrl.create);
router.put('/:id',        rbac('vessels'), audit('vessels'), validateUpdate, ctrl.update);
router.delete('/:id',     rbac('vessels'), audit('vessels'), ctrl.remove);

module.exports = router;
