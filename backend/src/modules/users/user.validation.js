'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  }
  next();
};

const validateCreate = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number'),
  body('roleId').isMongoId().withMessage('Valid role is required'),
  body('status').optional().isIn(['Active', 'Inactive']),
  handle,
];

const validateInvite = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('roleId').isMongoId().withMessage('Valid role is required'),
  handle,
];

const validateAcceptInvite = [
  body('token').notEmpty().withMessage('Token is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number'),
  handle,
];

const validateUpdate = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('roleId').optional().isMongoId(),
  body('status').optional().isIn(['Active', 'Inactive']),
  handle,
];

module.exports = { validateCreate, validateInvite, validateAcceptInvite, validateUpdate };
