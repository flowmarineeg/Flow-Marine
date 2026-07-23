'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { BOOKING_STATUS } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

// ── Row-level validators (applied inside cargoRows array) ─────────────────────
const rowValidators = [
  body('cargoRows').isArray({ min: 1 }).withMessage('At least one cargo row is required'),
  body('cargoRows.*.containerTypeId').notEmpty().isMongoId().withMessage('Valid container type required per row'),
  body('cargoRows.*.quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be a positive integer per row'),
  body('cargoRows.*.rate').notEmpty().isFloat({ min: 0 }).withMessage('Rate must be non-negative per row'),
  body('cargoRows.*.dg').optional({ nullable: true }).isBoolean().withMessage('DG must be true or false'),
  body('cargoRows.*.dgValue').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('cargoRows.*.commodity').optional({ nullable: true, checkFalsy: true }).trim(),
  body('cargoRows.*.vgm').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('VGM must be non-negative'),
];

const validateCreate = [
  body('voyageId').notEmpty().isMongoId().withMessage('Valid voyage is required'),
  body('agentId').notEmpty().isMongoId().withMessage('Valid agent is required'),
  // Sprint 030: POL/POD are no longer client-submitted — derived server-side from voyageId
  ...rowValidators,
  body('status').optional().isIn(BOOKING_STATUS).withMessage(`Must be one of: ${BOOKING_STATUS.join(', ')}`),
  body('remarks').optional({ nullable: true, checkFalsy: true }).trim(),
  // Server-only fields — reject if sent
  body('totalFreight').not().exists().withMessage('totalFreight is server-computed'),
  body('totalTEU').not().exists().withMessage('totalTEU is server-computed'),
  body('totalUnits').not().exists().withMessage('totalUnits is server-computed'),
  body('cargoRows.*.rowTotal').not().exists().withMessage('rowTotal is server-computed'),
  handle,
];

const validateUpdate = [
  body('agentId').optional().isMongoId(),
  // Sprint 030: POL/POD are not independently editable — derived from voyageId
  body('cargoRows').optional().isArray({ min: 1 }).withMessage('cargoRows must have at least one row if provided'),
  body('cargoRows.*.containerTypeId').optional().isMongoId(),
  body('cargoRows.*.quantity').optional().isInt({ min: 1 }),
  body('cargoRows.*.rate').optional().isFloat({ min: 0 }),
  body('cargoRows.*.dg').optional({ nullable: true }).isBoolean(),
  body('cargoRows.*.dgValue').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('cargoRows.*.commodity').optional({ nullable: true, checkFalsy: true }).trim(),
  body('cargoRows.*.vgm').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('status').optional().isIn(BOOKING_STATUS),
  body('remarks').optional({ nullable: true, checkFalsy: true }).trim(),
  handle,
];

module.exports = { validateCreate, validateUpdate };
