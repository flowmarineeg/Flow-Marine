'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { SERVICE_STATUS, SERVICE_APPLICABILITY } = require('../../config/constants');

const invoiceSetup = [
  body('applicability').optional().isIn(SERVICE_APPLICABILITY).withMessage(`Must be one of: ${SERVICE_APPLICABILITY.join(', ')}`),
  body('isTaxable').optional().isBoolean().withMessage('isTaxable must be true or false').toBoolean(),
  body('revenueAccountId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid revenue account'),
];

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

const serviceCodeRule = body('serviceCode')
  .trim().notEmpty().withMessage('Service code is required')
  .isLength({ max: 20 }).withMessage('Max 20 characters')
  .matches(/^[A-Za-z0-9-]+$/).withMessage('Only letters, numbers, and hyphens allowed');

const serviceNameRule = body('serviceName')
  .trim().notEmpty().withMessage('Service name is required')
  .isLength({ max: 100 }).withMessage('Max 100 characters');

const validateCreate = [
  serviceCodeRule,
  serviceNameRule,
  body('defaultVesselId').optional({ nullable: true, checkFalsy: true }).isMongoId().withMessage('Invalid vessel ID'),
  body('status').optional().isIn(SERVICE_STATUS).withMessage(`Must be one of: ${SERVICE_STATUS.join(', ')}`),
  ...invoiceSetup,
  handle,
];

const validateUpdate = [
  body('serviceCode').optional().trim().notEmpty()
    .isLength({ max: 20 }).matches(/^[A-Za-z0-9-]+$/),
  body('serviceName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('defaultVesselId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('status').optional().isIn(SERVICE_STATUS),
  ...invoiceSetup,
  handle,
];

module.exports = { validateCreate, validateUpdate };
