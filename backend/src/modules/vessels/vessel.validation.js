'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { VESSEL_STATUS, OWNERSHIP_TYPES } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

const validateCreate = [
  body('vesselCode').trim().notEmpty().withMessage('Vessel code is required').isLength({ max: 20 }).withMessage('Max 20 characters'),
  body('vesselName').trim().notEmpty().withMessage('Vessel name is required').isLength({ max: 100 }),
  body('ownershipType').notEmpty().withMessage('Ownership type is required').isIn(OWNERSHIP_TYPES).withMessage(`Must be one of: ${OWNERSHIP_TYPES.join(', ')}`),
  // imoNumber is now REQUIRED
  body('imoNumber').trim().notEmpty().withMessage('IMO number is required')
    .isLength({ min: 7, max: 7 }).withMessage('IMO number must be exactly 7 digits')
    .isNumeric().withMessage('IMO number must be numeric'),
  body('ownershipDescription').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 500 }),
  body('capacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Capacity must be a positive number'),
  body('dwt').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('DWT must be a positive number'),
  body('builtYear').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1800, max: new Date().getFullYear() + 1 }).withMessage('Invalid built year'),
  body('status').optional().isIn(VESSEL_STATUS).withMessage(`Must be one of: ${VESSEL_STATUS.join(', ')}`),
  body('charterStartDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid charter start date'),
  body('charterEndDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid charter end date'),
  handle,
];

const validateUpdate = [
  body('vesselCode').optional().trim().notEmpty().isLength({ max: 20 }),
  body('vesselName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('ownershipType').optional().isIn(OWNERSHIP_TYPES),
  body('imoNumber').optional().trim().notEmpty()
    .isLength({ min: 7, max: 7 }).isNumeric(),
  body('ownershipDescription').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 500 }),
  body('capacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('dwt').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('builtYear').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1800, max: new Date().getFullYear() + 1 }),
  body('status').optional().isIn(VESSEL_STATUS),
  handle,
];

module.exports = { validateCreate, validateUpdate };
