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
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  // slotCount removed
  body('freightRate').notEmpty().isFloat({ min: 0 }).withMessage('Freight rate must be a non-negative number'),
  body('status').optional().isIn(BOOKING_STATUS).withMessage(`Must be one of: ${BOOKING_STATUS.join(', ')}`),
  // New cargo detail fields
  body('containerNumber').notEmpty().withMessage('Container number is required').trim().toUpperCase().isLength({ max: 20 }).withMessage('Container number max 20 chars'),
  body('vgm').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('VGM must be a non-negative number'),
  body('dg').optional({ nullable: true }).isBoolean().withMessage('DG must be true or false'),
  body('dgPercent').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100 }).withMessage('DG percent must be 0–100'),
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
  body('containerTypeId').optional().isMongoId(),
  body('quantity').optional().isInt({ min: 1 }),
  // slotCount removed
  body('freightRate').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(BOOKING_STATUS),
  // New cargo detail fields
  body('containerNumber').optional().trim().toUpperCase().isLength({ max: 20 }),
  body('vgm').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('dg').optional({ nullable: true }).isBoolean(),
  body('dgPercent').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100 }),
  body('containerStatus').optional({ nullable: true, checkFalsy: true }).isIn(['Full', 'Empty']).withMessage('Container status must be Full or Empty'),
  handle,
];

module.exports = { validateCreate, validateUpdate };
