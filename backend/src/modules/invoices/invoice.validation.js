'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { INVOICE_TYPES, INVOICE_STATUS } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

// Sprint 033: an invoice now owns an array of bookingIds (Booking type = 1,
// Voyage/Round type = many), never a single bookingId.
const validateCreate = [
  body('invoiceType').notEmpty().isIn(INVOICE_TYPES).withMessage('Valid invoice type is required'),
  body('agentId').notEmpty().isMongoId().withMessage('Valid agent is required'),
  body('voyageId').if(body('invoiceType').equals('Voyage')).notEmpty().isMongoId().withMessage('voyageId is required for a Voyage invoice'),
  body('roundId').if(body('invoiceType').equals('Round')).notEmpty().isMongoId().withMessage('roundId is required for a Round invoice'),
  body('bookingIds').isArray({ min: 1 }).withMessage('At least one booking is required'),
  body('bookingIds.*').isMongoId().withMessage('Every bookingId must be valid'),
  body('invoiceDate').notEmpty().isISO8601().withMessage('Valid invoice date is required'),
  body('dueDate').notEmpty().isISO8601().withMessage('Valid due date is required'),
  body('currency').trim().notEmpty().withMessage('Currency is required').isLength({ max: 10 }),
  body('notes').optional({ nullable: true, checkFalsy: true }).isString(),
  handle,
];

const validateUpdate = [
  body('invoiceDate').optional().isISO8601(),
  body('dueDate').optional().isISO8601(),
  body('currency').optional().trim().notEmpty().isLength({ max: 10 }),
  // Sprint046: the narrow Issued/Cancelled-only business rule now lives in
  // validateManualTransition() (invoice.service.js), which only runs for
  // non-override requests — this just confirms it's a real enum value so an
  // admin override request isn't rejected before it reaches the service.
  body('status').optional().isIn(INVOICE_STATUS),
  body('notes').optional({ nullable: true, checkFalsy: true }).isString(),
  handle,
];

// Sprint 047 — Bill To (PDF contact details). All optional free text; this
// is presentational data for the PDF, not financial, so it carries none of
// validateUpdate's business-rule constraints.
const validateBillTo = [
  body('phone').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 50 }),
  body('mobile').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 50 }),
  body('email').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 150 }),
  body('jobCode').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 100 }),
  body('taxId').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 100 }),
  body('address').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 300 }),
  body('office').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 150 }),
  handle,
];

module.exports = { validateCreate, validateUpdate, validateBillTo };
