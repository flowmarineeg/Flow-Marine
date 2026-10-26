'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const { OPERATIONAL_LEVELS } = require('./expenseType.logic');

const mapping = [
  body('operationalLevel').optional().isIn(OPERATIONAL_LEVELS).withMessage(`Must be one of: ${OPERATIONAL_LEVELS.join(', ')}`),
  body('requiresPda').optional().isBoolean().withMessage('requiresPda must be true or false').toBoolean(),
  body('expenseAccountId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid expense account'),
  body('accrualAccountId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid accrual account'),
];

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  next();
};

const validateCreate = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  // category is now a free string — no enum constraint
  body('category').trim().notEmpty().withMessage('Category is required').isLength({ max: 50 }).withMessage('Max 50 characters'),
  ...mapping,
  handle,
];

const validateUpdate = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('category').optional().trim().notEmpty().isLength({ max: 50 }),
  ...mapping,
  handle,
];

module.exports = { validateCreate, validateUpdate };
