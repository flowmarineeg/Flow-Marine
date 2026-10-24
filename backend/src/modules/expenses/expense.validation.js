'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

const validateCreate = [
  body('expenseTypeId').notEmpty().isMongoId().withMessage('Valid expense type is required'),
  body('amount').notEmpty().isFloat({ min: 0 }).withMessage('Amount must be a non-negative number'),
  body('currency').trim().notEmpty().withMessage('Currency is required').isLength({ max: 10 }),
  body('expenseDate').notEmpty().isISO8601().withMessage('Valid expense date is required'),
  body('agentId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('roundId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('voyageId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  // Sprint 036 — Port Expense scope. No `scope` field exists; scope is
  // always inferred from roundId/voyageId/portId (expense.service.js#deriveScope).
  body('portId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('kind').optional({ checkFalsy: true }).isIn(['PDA', 'FDA']),
  body('paidBy').optional({ nullable: true, checkFalsy: true }).isIn(['PortAgent', 'Company', 'Partner']),
  body('paidByPartnerId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  handle,
];

const validateUpdate = [
  body('expenseTypeId').optional().isMongoId(),
  body('amount').optional().isFloat({ min: 0 }),
  body('currency').optional().trim().notEmpty().isLength({ max: 10 }),
  body('expenseDate').optional().isISO8601(),
  body('agentId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('roundId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('voyageId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('portId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('kind').optional({ checkFalsy: true }).isIn(['PDA', 'FDA']),
  body('paidBy').optional({ nullable: true, checkFalsy: true }).isIn(['PortAgent', 'Company', 'Partner']),
  body('paidByPartnerId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  handle,
];

module.exports = { validateCreate, validateUpdate };
