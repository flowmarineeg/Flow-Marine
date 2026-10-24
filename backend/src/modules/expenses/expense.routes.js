'use strict';

const express  = require('express');
const router   = express.Router();
const ctrl     = require('./expense.controller');
const auth     = require('../../middleware/auth');
const rbac     = require('../../middleware/rbac');
const audit    = require('../../middleware/auditLogger');
const { compressUpload } = require('../../middleware/upload');
const { validateCreate, validateUpdate } = require('./expense.validation');
const v2 = require('./expenseV2.service');
const { success, created } = require('../../utils/responseHelper');

router.use(auth);

// Sprint020: authenticated file download — replaces public express.static
// Must be before /:id to avoid shadowing
router.get('/:id/attachment', rbac('expenses'), ctrl.getAttachment);

// Sprint 052 V2 - PDA -> FDA, posting to the ledger. approve = expense.approve_fda.
router.post('/:id/convert-fda', rbac('expenses', 'approve'), audit('expenses'), async (req, res, next) => {
  try { return created(res, await v2.convertToFda(req.params.id, req.body, req.user._id), 'Final expense created'); } catch (e) { next(e); }
});
router.post('/:id/post', rbac('expenses', 'approve'), audit('expenses'), async (req, res, next) => {
  try { return success(res, await v2.postExpense(req.params.id, req.user._id), 'Expense posted'); } catch (e) { next(e); }
});
router.post('/:id/reverse', rbac('expenses', 'approve'), audit('expenses'), async (req, res, next) => {
  try { return success(res, await v2.reverseExpense(req.params.id, req.body?.reason, req.user._id), 'Expense reversed'); } catch (e) { next(e); }
});

router.get('/',       rbac('expenses'), ctrl.list);
router.get('/:id',    rbac('expenses'), ctrl.getById);
router.post('/',      rbac('expenses'), compressUpload, audit('expenses'), validateCreate, ctrl.create);
router.put('/:id',    rbac('expenses'), compressUpload, audit('expenses'), validateUpdate, ctrl.update);
router.delete('/:id', rbac('expenses'), audit('expenses'), ctrl.remove);

module.exports = router;
