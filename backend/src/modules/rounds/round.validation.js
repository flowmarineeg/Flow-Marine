'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { ROUND_STATUS } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

const validateCreate = [
  body('serviceId').notEmpty().isMongoId().withMessage('Valid service is required'),
  body('vesselId').notEmpty().isMongoId().withMessage('Valid vessel is required'),
  body('startDate').notEmpty().isISO8601().withMessage('Valid start date is required'),
  body('endDate').notEmpty().isISO8601().withMessage('Valid end date is required'),
  body('status').optional().isIn(ROUND_STATUS).withMessage(`Must be one of: ${ROUND_STATUS.join(', ')}`),
  body('roundName').trim().notEmpty().withMessage('Round Name is required'),
  handle,
];

const validateUpdate = [
  body('vesselId').optional().isMongoId(),
  body('startDate').optional().isISO8601(),
  body('endDate').optional().isISO8601(),
  body('status').optional().isIn(ROUND_STATUS),
  body('roundName').optional({ nullable: true, checkFalsy: true }).trim(),
  handle,
];

module.exports = { validateCreate, validateUpdate };
