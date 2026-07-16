'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  next();
};

// ─── Country ──────────────────────────────────────────────────────────────────
const validateCountryCreate = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('code').trim().notEmpty().withMessage('Code is required')
    .isAlpha().withMessage('Code must contain only letters')
    .isLength({ min: 2, max: 2 }).withMessage('Code must be exactly 2 letters'),
  handle,
];

const validateCountryUpdate = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('code').optional().trim().isAlpha().withMessage('Code must contain only letters').isLength({ min: 2, max: 2 }).withMessage('Code must be exactly 2 letters'),
  handle,
];

// ─── City ─────────────────────────────────────────────────────────────────────
const validateCityCreate = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('countryId').notEmpty().withMessage('Country is required').isMongoId().withMessage('Invalid country'),
  handle,
];

const validateCityUpdate = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('countryId').optional().isMongoId().withMessage('Invalid country'),
  handle,
];

// ─── Port ─────────────────────────────────────────────────────────────────────
const validatePortCreate = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('cityId').notEmpty().withMessage('City is required').isMongoId().withMessage('Invalid city'),
  body('countryId').notEmpty().withMessage('Country is required').isMongoId().withMessage('Invalid country'),
  body('code').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 10 }),
  handle,
];

const validatePortUpdate = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('cityId').optional().isMongoId().withMessage('Invalid city'),
  body('countryId').optional().isMongoId().withMessage('Invalid country'),
  body('code').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 10 }),
  handle,
];

// ─── Terminal ─────────────────────────────────────────────────────────────────
const validateTerminalCreate = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('portId').notEmpty().withMessage('Port is required').isMongoId().withMessage('Invalid port'),
  handle,
];

const validateTerminalUpdate = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('portId').optional().isMongoId().withMessage('Invalid port'),
  handle,
];

module.exports = {
  validateCountryCreate, validateCountryUpdate,
  validateCityCreate, validateCityUpdate,
  validatePortCreate, validatePortUpdate,
  validateTerminalCreate, validateTerminalUpdate,
};
