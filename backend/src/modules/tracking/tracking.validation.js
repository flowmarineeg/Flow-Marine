'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { TRACKING_STATUS } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

const validateCreate = [
  body('voyageId').notEmpty().isMongoId().withMessage('Valid voyage is required'),
  body('roundId').notEmpty().isMongoId().withMessage('Valid round is required'),
  body('vesselId').notEmpty().isMongoId().withMessage('Valid vessel is required'),
  body('serviceId').notEmpty().isMongoId().withMessage('Valid service is required'),
  body('portId').notEmpty().isMongoId().withMessage('Port is required'),
  body('countryId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('cityId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('terminalId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('status').notEmpty().isIn(TRACKING_STATUS).withMessage(`Must be one of: ${TRACKING_STATUS.join(', ')}`),
  body('lastUpdate').notEmpty().isISO8601().withMessage('Valid datetime is required'),
  handle,
];

module.exports = { validateCreate };
