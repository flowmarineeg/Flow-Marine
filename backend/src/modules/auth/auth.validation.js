'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  }
  next();
};

const validateLogin = [
  // Do NOT use .normalizeEmail() — it transforms addresses aggressively
  // (strips dots, lowercases Gmail aliases, etc.) which can cause a mismatch
  // with the stored email. The service already calls email.toLowerCase().
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidation,
];

const validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  handleValidation,
];

const validateForgotPassword = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required'),
  handleValidation,
];

const validateResetPassword = [
  // .isString() is load-bearing, not cosmetic: without it, a JSON body of
  // {"token":{"$ne":null}} sails through notEmpty() and turns
  // auth.service.js#resetPassword's `resetToken: token` into a live Mongo
  // operator, matching any user with a pending reset token — NoSQL
  // injection -> account takeover. Never remove this check.
  body('token').isString().notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  handleValidation,
];

module.exports = {
  validateLogin,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
};
