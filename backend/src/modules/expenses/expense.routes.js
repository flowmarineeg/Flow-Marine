'use strict';

const express  = require('express');
const router   = express.Router();
const ctrl     = require('./expense.controller');
const auth     = require('../../middleware/auth');
const rbac     = require('../../middleware/rbac');
const audit    = require('../../middleware/auditLogger');
const { compressUpload } = require('../../middleware/upload');
const { validateCreate, validateUpdate } = require('./expense.validation');

router.use(auth);

// Sprint020: authenticated file download — replaces public express.static
// Must be before /:id to avoid shadowing
router.get('/:id/attachment', rbac('expenses'), ctrl.getAttachment);

router.get('/',       rbac('expenses'), ctrl.list);
router.get('/:id',    rbac('expenses'), ctrl.getById);
router.post('/',      rbac('expenses'), compressUpload, audit('expenses'), validateCreate, ctrl.create);
router.put('/:id',    rbac('expenses'), compressUpload, audit('expenses'), validateUpdate, ctrl.update);
router.delete('/:id', rbac('expenses'), audit('expenses'), ctrl.remove);

module.exports = router;
