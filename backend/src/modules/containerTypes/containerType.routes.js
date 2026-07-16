'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./containerType.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./containerType.validation');

router.use(auth);
router.get('/',       rbac('containerTypes'), ctrl.list);
router.get('/:id',    rbac('containerTypes'), ctrl.getById);
router.post('/',      rbac('containerTypes'), audit('containerTypes'), validateCreate, ctrl.create);
router.put('/:id',    rbac('containerTypes'), audit('containerTypes'), validateUpdate, ctrl.update);
router.delete('/:id', rbac('containerTypes'), audit('containerTypes'), ctrl.remove);

module.exports = router;
