'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { PAYMENT_METHODS } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

const validateCreate = [
  body('paymentDate').notEmpty().isISO8601().withMessage('Valid payment date is required'),
  body('method').notEmpty().isIn(PAYMENT_METHODS).withMessage('Valid payment method is required'),
  body('reference').optional({ nullable: true, checkFalsy: true }).isString(),
  body('notes').optional({ nullable: true, checkFalsy: true }).isString(),
  body('allocations').isArray({ min: 1 }).withMessage('At least one allocation is required'),
  body('allocations.*.bookingId').isMongoId().withMessage('Each allocation needs a valid bookingId'),
  body('allocations.*.amount').isFloat({ gt: 0 }).withMessage('Each allocation amount must be greater than 0'),
  handle,
];

const validateVoid = [
  body('voidReason').optional({ nullable: true, checkFalsy: true }).isString(),
  handle,
];

module.exports = { validateCreate, validateVoid };
