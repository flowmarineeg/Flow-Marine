'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./agent.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./agent.validation');

router.use(auth);
router.get('/',       rbac('agents'), ctrl.list);
router.get('/:id',    rbac('agents'), ctrl.getById);
router.post('/',      rbac('agents'), audit('agents'), validateCreate, ctrl.create);
router.put('/:id',    rbac('agents'), audit('agents'), validateUpdate, ctrl.update);
router.delete('/:id', rbac('agents'), audit('agents'), ctrl.remove);

module.exports = router;
