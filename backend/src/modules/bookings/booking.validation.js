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
  body('voyageId').notEmpty().isMongoId().withMessage('Valid voyage is required'),
  body('agentId').notEmpty().isMongoId().withMessage('Valid agent is required'),
  // shipper + consignee are now optional
  body('shipper').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('consignee').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('carrierName').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('polId').notEmpty().isMongoId().withMessage('Valid POL port is required'),
  body('podId').notEmpty().isMongoId().withMessage('Valid POD port is required'),
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
  body('polId').optional().isMongoId(),
  body('podId').optional().isMongoId(),
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
