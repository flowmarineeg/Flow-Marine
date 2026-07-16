'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./round.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./round.validation');

router.use(auth);

router.get('/',              rbac('rounds'), ctrl.list);
router.get('/:id',           rbac('rounds'), ctrl.getById);
router.get('/:id/voyages',   rbac('rounds'), ctrl.getRoundVoyages);
router.post('/',             rbac('rounds'), audit('rounds'), validateCreate, ctrl.create);
router.put('/:id',           rbac('rounds'), audit('rounds'), validateUpdate, ctrl.update);
router.delete('/:id',        rbac('rounds'), audit('rounds'), ctrl.remove);

module.exports = router;
