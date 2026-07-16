'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { INVOICE_STATUS } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

const validateCreate = [
  body('bookingId').notEmpty().isMongoId().withMessage('Valid booking is required'),
  body('agentId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('invoiceDate').notEmpty().isISO8601().withMessage('Valid invoice date is required'),
  body('dueDate').notEmpty().isISO8601().withMessage('Valid due date is required'),
  body('amount').notEmpty().isFloat({ min: 0 }).withMessage('Amount must be a non-negative number'),
  body('currency').trim().notEmpty().withMessage('Currency is required').isLength({ max: 10 }),
  body('status').optional().isIn(INVOICE_STATUS),
  handle,
];

const validateUpdate = [
  body('agentId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('invoiceDate').optional().isISO8601(),
  body('dueDate').optional().isISO8601(),
  body('amount').optional().isFloat({ min: 0 }),
  body('currency').optional().trim().notEmpty().isLength({ max: 10 }),
  body('status').optional().isIn(INVOICE_STATUS),
  handle,
];

module.exports = { validateCreate, validateUpdate };
