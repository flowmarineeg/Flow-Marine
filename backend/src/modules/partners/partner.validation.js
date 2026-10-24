'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  next();
};

const validateCreate = [
  body('code').isString().trim().notEmpty().withMessage('Code is required').isLength({ max: 20 }),
  body('name').isString().trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  body('status').optional().isIn(['Active', 'Inactive']),
  body('contact.email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email'),
  handle,
];

const validateUpdate = [
  body('code').optional().isString().trim().notEmpty().isLength({ max: 20 }),
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('status').optional().isIn(['Active', 'Inactive']),
  body('contact.email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email'),
  handle,
];

const validateShares = [
  body('shares').isArray({ min: 1 }).withMessage('shares must be a non-empty array'),
  body('shares.*.partnerId').isMongoId().withMessage('Invalid partnerId'),
  body('shares.*.shareBp').isInt({ min: 1, max: 10000 }).withMessage('shareBp must be an integer 1-10000').toInt(),
  body('shares.*.isLead').optional().isBoolean().toBoolean(),
  handle,
];

module.exports = { validateCreate, validateUpdate, validateShares };
