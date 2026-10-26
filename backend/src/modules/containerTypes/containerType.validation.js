'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { CONTAINER_SIZES, CONTAINER_TYPES } = require('../../config/constants');
const { isIsoContainerCode } = require('../../utils/masterValidators');

const iso = body('isoCode').optional({ nullable: true, checkFalsy: true }).custom(isIsoContainerCode)
  .withMessage('ISO code must look like 22G1 / 45G1 / 42R1 (4 characters)');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  next();
};

const validateCreate = [
  body('code').trim().notEmpty().withMessage('Code is required').isLength({ max: 20 }),
  body('size').notEmpty().withMessage('Size is required').isIn(CONTAINER_SIZES).withMessage(`Must be one of: ${CONTAINER_SIZES.join(', ')}`),
  body('type').notEmpty().withMessage('Type is required').isIn(CONTAINER_TYPES).withMessage(`Must be one of: ${CONTAINER_TYPES.join(', ')}`),
  body('description').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  iso,
  handle,
];

const validateUpdate = [
  body('code').optional().trim().notEmpty().isLength({ max: 20 }),
  body('size').optional().isIn(CONTAINER_SIZES),
  body('type').optional().isIn(CONTAINER_TYPES),
  body('description').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  iso,
  handle,
];

module.exports = { validateCreate, validateUpdate };
