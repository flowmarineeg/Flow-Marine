'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./voyage.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./voyage.validation');

router.use(auth);

// Round route-ports lookup — BEFORE /:id to avoid shadowing
router.get('/round-ports/:roundId', rbac('voyages'), ctrl.getRoundRoutePorts);

router.get('/',       rbac('voyages'), ctrl.list);
router.get('/:id',    rbac('voyages'), ctrl.getById);

// Manual voyage creation (Sprint 016)
router.post('/',      rbac('voyages'), audit('voyages'), validateCreate, ctrl.create);

router.put('/:id',    rbac('voyages'), audit('voyages'), validateUpdate, ctrl.update);

// Voyage deletion (Sprint 016)
router.delete('/:id', rbac('voyages'), audit('voyages'), ctrl.remove);

module.exports = router;
