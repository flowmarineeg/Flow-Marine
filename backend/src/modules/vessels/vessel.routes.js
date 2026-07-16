'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./vessel.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./vessel.validation');

router.use(auth);
router.get('/',           rbac('vessels'), ctrl.list);
router.get('/:id/stats',  rbac('vessels'), ctrl.getStats);   // BEFORE /:id
router.get('/:id',        rbac('vessels'), ctrl.getById);
router.post('/',          rbac('vessels'), audit('vessels'), validateCreate, ctrl.create);
router.put('/:id',        rbac('vessels'), audit('vessels'), validateUpdate, ctrl.update);
router.delete('/:id',     rbac('vessels'), audit('vessels'), ctrl.remove);

module.exports = router;
