'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./invoice.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./invoice.validation');

router.use(auth);

router.get('/',        rbac('invoices'), ctrl.list);
router.get('/:id/pdf', rbac('invoices'), ctrl.downloadPdf); // Sprint020: PDF export
router.get('/:id',     rbac('invoices'), ctrl.getById);
router.post('/',       rbac('invoices'), audit('invoices'), validateCreate, ctrl.create);
router.put('/:id',     rbac('invoices'), audit('invoices'), validateUpdate, ctrl.update);
router.delete('/:id',  rbac('invoices'), audit('invoices'), ctrl.remove);

module.exports = router;
