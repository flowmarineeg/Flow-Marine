'use strict';

const express     = require('express');
const router      = express.Router();
const svcCtrl     = require('./service.controller');
const routeCtrl   = require('../routes/route.controller');
const auth        = require('../../middleware/auth');
const rbac        = require('../../middleware/rbac');
const audit       = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./service.validation');
const { validateSaveRoute }             = require('../routes/route.validation');

router.use(auth);

// ─── Service CRUD ─────────────────────────────────────────────────────────────
router.get('/',          rbac('services'), svcCtrl.list);
router.get('/active',    rbac('services'), svcCtrl.listActive);
router.get('/:id',       rbac('services'), svcCtrl.getById);
router.post('/',         rbac('services'), audit('services'), validateCreate, svcCtrl.create);
router.put('/:id',       rbac('services'), audit('services'), validateUpdate, svcCtrl.update);
router.delete('/:id',    rbac('services'), audit('services'), svcCtrl.remove);

// ─── Route Legs (nested under service) ───────────────────────────────────────
router.get('/:id/route',  rbac('routes'), routeCtrl.getRoute);
router.post('/:id/route', rbac('routes'), audit('routes'), validateSaveRoute, routeCtrl.saveRoute);
router.put('/:id/route',  rbac('routes'), audit('routes'), validateSaveRoute, routeCtrl.saveRoute);

module.exports = router;
