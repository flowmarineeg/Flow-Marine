'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { SERVICE_STATUS, SERVICE_APPLICABILITY } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  next();
};

const validateCreate = [
  body('serviceName').isString().trim().notEmpty().withMessage('Service name is required').isLength({ max: 100 }),
  body('applicability').notEmpty().withMessage('Applicability is required').isIn(SERVICE_APPLICABILITY).withMessage(`Must be one of: ${SERVICE_APPLICABILITY.join(', ')}`),
  body('isTaxable').exists({ values: 'null' }).withMessage('Is taxable is required').isBoolean().withMessage('Is taxable must be true or false').toBoolean(),
  body('revenueAccountId').notEmpty().withMessage('Revenue account is required').isMongoId().withMessage('Invalid revenue account'),
  body('status').optional().isIn(SERVICE_STATUS),
  handle,
];

const validateUpdate = [
  body('serviceName').optional().isString().trim().notEmpty().isLength({ max: 100 }),
  body('applicability').optional().isIn(SERVICE_APPLICABILITY),
  body('isTaxable').optional().isBoolean().toBoolean(),
  body('revenueAccountId').optional().isMongoId().withMessage('Invalid revenue account'),
  body('status').optional().isIn(SERVICE_STATUS),
  handle,
];

module.exports = { validateCreate, validateUpdate };
