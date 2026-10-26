'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { isCurrencyCode, isEmail } = require('../../utils/masterValidators');
const { CUSTOMER_TYPES } = require('./customer.model');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  next();
};

const nn = { nullable: true, checkFalsy: true };
const shared = [
  body('status').optional().isIn(['Active', 'Inactive']),
  body('defaultCurrency').optional(nn).custom(isCurrencyCode).withMessage('Default currency must be a 3-letter code'),
  body('arAccountId').optional(nn).isMongoId().withMessage('Invalid AR account'),
  body('contacts').optional().isArray({ max: 20 }).withMessage('contacts must be an array (max 20)'),
  body('contacts.*.name').isString().trim().notEmpty().withMessage('Each contact needs a name'),
  body('contacts.*.email').optional(nn).custom(isEmail).withMessage('Invalid contact email'),
];

const validateCreate = [
  body('customerCode').isString().trim().notEmpty().withMessage('Customer code is required').isLength({ max: 20 }),
  body('customerName').isString().trim().notEmpty().withMessage('Customer name is required').isLength({ max: 120 }),
  body('customerType').notEmpty().withMessage('Customer type is required').isIn(CUSTOMER_TYPES).withMessage(`Must be one of: ${CUSTOMER_TYPES.join(', ')}`),
  ...shared,
  handle,
];

const validateUpdate = [
  body('customerCode').optional().isString().trim().notEmpty().isLength({ max: 20 }),
  body('customerName').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('customerType').optional().isIn(CUSTOMER_TYPES).withMessage(`Must be one of: ${CUSTOMER_TYPES.join(', ')}`),
  ...shared,
  handle,
];

module.exports = { validateCreate, validateUpdate };
