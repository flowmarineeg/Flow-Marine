'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  next();
};

const validateCreate = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  // category is now a free string — no enum constraint
  body('category').trim().notEmpty().withMessage('Category is required').isLength({ max: 50 }).withMessage('Max 50 characters'),
  handle,
];

const validateUpdate = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('category').optional().trim().notEmpty().isLength({ max: 50 }),
  handle,
];

module.exports = { validateCreate, validateUpdate };
