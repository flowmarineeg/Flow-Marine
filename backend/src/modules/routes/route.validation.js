'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

const validateSaveRoute = [
  body('legs').isArray({ min: 2 }).withMessage('Route must have at least 2 legs'),
  body('legs.*.countryId').notEmpty().isMongoId().withMessage('Each leg requires a valid country'),
  body('legs.*.cityId').notEmpty().isMongoId().withMessage('Each leg requires a valid city'),
  body('legs.*.portId').notEmpty().isMongoId().withMessage('Each leg requires a valid port'),
  body('legs.*.terminalId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('legs.*.agentId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  handle,
];

module.exports = { validateSaveRoute };
