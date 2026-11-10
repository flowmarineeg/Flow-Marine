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

const validateCreate = [
  // Bookings sprint 2026-11-10: round + the booking's own POL/POD. The voyage is assigned by the server;
  // voyageId is only the pick among candidates after a 409 VOYAGE_AMBIGUOUS.
  body('roundId').notEmpty().isMongoId().withMessage('Valid round is required'),
  body('polId').notEmpty().isMongoId().withMessage('Valid POL is required'),
  body('podId').notEmpty().isMongoId().withMessage('Valid POD is required'),
  body('polLegKey').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 60 }),
  body('podLegKey').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 60 }),
  body('voyageId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Valid voyage is required'),
  body('partnerId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Valid partner is required'),
  body('agentId').notEmpty().isMongoId().withMessage('Valid agent is required'),
  // shipper + consignee are now optional
  body('shipper').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('consignee').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('carrierName').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('containerTypeId').notEmpty().isMongoId().withMessage('Valid container type is required'),
  // Sprint 025: quantity removed from Layer 2 entirely
  body('freightRate').notEmpty().isFloat({ min: 0 }).withMessage('Freight rate must be a non-negative number'),
  body('status').optional().isIn(BOOKING_STATUS).withMessage(`Must be one of: ${BOOKING_STATUS.join(', ')}`),
  // New cargo detail fields
  body('containerNumber').notEmpty().withMessage('Container number is required').trim().toUpperCase().isLength({ max: 20 }).withMessage('Container number max 20 chars'),
  body('vgm').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('VGM must be a non-negative number'),
  body('dg').optional({ nullable: true }).isBoolean().withMessage('Hazardous must be true or false'),
  body('imdgCode').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('IMDG Code must be 50 characters or less'),
  // Sprint 026: dgPercent removed — replaced by imdgCode
  body('containerStatus').optional({ nullable: true, checkFalsy: true }).isIn(['Full', 'Empty']).withMessage('Container status must be Full or Empty'),
  handle,
];

const validateUpdate = [
  body('agentId').optional().isMongoId(),
  body('shipper').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('consignee').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('carrierName').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  // POL/POD, leg keys and the voyage are fixed at creation: a different route is a new booking
  body('partnerId').optional({ nullable: true }).custom((v) => v === null || v === '' || /^[0-9a-fA-F]{24}$/.test(String(v))).withMessage('Valid partner is required'),
  body('containerTypeId').optional().isMongoId().withMessage('Valid container type is required'),
  // Sprint 025: quantity removed from Layer 2 entirely
  body('freightRate').optional().isFloat({ min: 0 }).withMessage('Freight rate must be a non-negative number'),
  body('status').optional().isIn(BOOKING_STATUS),
  // New cargo detail fields
  body('containerNumber').optional().trim().toUpperCase().isLength({ max: 20 }),
  body('vgm').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('dg').optional({ nullable: true }).isBoolean().withMessage('Hazardous must be true or false'),
  body('imdgCode').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('IMDG Code must be 50 characters or less'),
  // Sprint 026: dgPercent removed — replaced by imdgCode
  body('containerStatus').optional({ nullable: true, checkFalsy: true }).isIn(['Full', 'Empty']).withMessage('Container status must be Full or Empty'),
  handle,
];

module.exports = { validateCreate, validateUpdate };
