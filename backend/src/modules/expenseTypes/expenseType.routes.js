'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./expenseType.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./expenseType.validation');
const { body, validationResult } = require('express-validator');
const { EXPENSE_COST_CLASSIFICATIONS } = require('../../config/constants');

const handleVal = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
  next();
};

router.use(auth);

// ─── Category routes (before /:id to avoid shadowing) ───────────────────────
router.get   ('/categories',     rbac('expenseTypes'), ctrl.getCategories);
router.post  ('/categories',     rbac('expenseTypes'),
  [
    body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 50 }),
    body('costClassification').optional().isIn(EXPENSE_COST_CLASSIFICATIONS)
      .withMessage(`costClassification must be one of: ${EXPENSE_COST_CLASSIFICATIONS.join(', ')}`),
    handleVal,
  ],
  ctrl.createCategory
);
// Sprint 035 — the only field this route can change is costClassification;
// category name remains not renameable (deliberate, unchanged limitation).
router.put   ('/categories/:id', rbac('expenseTypes'),
  [
    body('costClassification').notEmpty().isIn(EXPENSE_COST_CLASSIFICATIONS)
      .withMessage(`costClassification must be one of: ${EXPENSE_COST_CLASSIFICATIONS.join(', ')}`),
    handleVal,
  ],
  ctrl.updateCategoryClassification
);
router.delete('/categories/:id', rbac('expenseTypes'), ctrl.deleteCategory);

// ─── Expense Type CRUD ───────────────────────────────────────────────────────
router.get   ('/',     rbac('expenseTypes'), ctrl.list);
router.get   ('/:id',  rbac('expenseTypes'), ctrl.getById);
router.post  ('/',     rbac('expenseTypes'), audit('expenseTypes'), validateCreate, ctrl.create);
router.put   ('/:id',  rbac('expenseTypes'), audit('expenseTypes'), validateUpdate, ctrl.update);
router.delete('/:id',  rbac('expenseTypes'), audit('expenseTypes'), ctrl.remove);

module.exports = router;
