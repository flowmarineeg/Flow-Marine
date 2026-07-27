'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { VOYAGE_STATUS } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

// ─── Validate manual voyage creation ─────────────────────────────────────────
const validateCreate = [
  body('roundId').notEmpty().withMessage('Round is required').isMongoId(),
  body('polId').notEmpty().withMessage('Port of Loading is required').isMongoId(),
  body('podId').notEmpty().withMessage('Port of Discharge is required').isMongoId(),
  body('etd').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ETD'),
  body('eta').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ETA'),
  body('etp').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ETP'),
  body('atd').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ATD'),
  body('ata').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ATA'),
  body('status').optional().isIn(VOYAGE_STATUS).withMessage(`Status must be one of: ${VOYAGE_STATUS.join(', ')}`),
  body('voyageCode').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 50 }),
  body('voyageName').trim().notEmpty().withMessage('Voyage Name is required'),
  handle,
];

// ─── Validate voyage update ───────────────────────────────────────────────────
const validateUpdate = [
  body('etd').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ETD date'),
  body('eta').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ETA date'),
  body('etp').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ETP date'),
  body('atd').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ATD date'),
  body('ata').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid ATA date'),
  body('status').optional().isIn(VOYAGE_STATUS).withMessage(`Must be one of: ${VOYAGE_STATUS.join(', ')}`),
  body('voyageCode').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 50 }),
  body('voyageName').optional({ nullable: true, checkFalsy: true }).trim(),
  handle,
];

module.exports = { validateCreate, validateUpdate };
