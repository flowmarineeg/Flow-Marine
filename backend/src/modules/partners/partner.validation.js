'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  next();
};

const { isEmail, isCurrencyCode } = require('../../utils/masterValidators');
const { bankAccountRules } = require('../../utils/bankAccounts');

const optional = { nullable: true, checkFalsy: true };
const extra = [
  body('baseCurrency').optional(optional).custom(isCurrencyCode).withMessage('Base currency must be a 3-letter code'),
  body('contacts').optional().isArray({ max: 20 }).withMessage('contacts must be an array (max 20)'),
  body('contacts.*.name').isString().trim().notEmpty().withMessage('Each contact needs a name'),
  body('contacts.*.email').optional(optional).custom(isEmail).withMessage('Invalid contact email'),
  ...bankAccountRules,
];

const validateCreate = [
  body('code').isString().trim().notEmpty().withMessage('Code is required').isLength({ max: 20 }),
  body('name').isString().trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  body('status').optional().isIn(['Active', 'Inactive']),
  body('contact.email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email'),
  ...extra,
  handle,
];

const validateUpdate = [
  body('code').optional().isString().trim().notEmpty().isLength({ max: 20 }),
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('status').optional().isIn(['Active', 'Inactive']),
  body('contact.email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email'),
  ...extra,
  handle,
];

const validateShares = [
  body('shares').isArray({ min: 1 }).withMessage('shares must be a non-empty array'),
  body('shares.*.partnerId').isMongoId().withMessage('Invalid partnerId'),
  body('shares.*.shareBp').isInt({ min: 1, max: 10000 }).withMessage('shareBp must be an integer 1-10000').toInt(),
  handle,
];

module.exports = { validateCreate, validateUpdate, validateShares };
