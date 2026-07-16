'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { AGENT_STATUS } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  next();
};

const validateCreate = [
  // agentCode is now OPTIONAL
  body('agentCode').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('Max 20 characters'),
  body('agentName').trim().notEmpty().withMessage('Agent name is required').isLength({ max: 100 }),
  // contacts array — each item fully optional
  body('contacts').optional().isArray(),
  body('contacts.*.email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('contacts.*.contactPerson').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }),
  body('contacts.*.mobile').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 30 }),
  body('contacts.*.description').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('status').optional().isIn(AGENT_STATUS).withMessage(`Must be one of: ${AGENT_STATUS.join(', ')}`),
  handle,
];

const validateUpdate = [
  body('agentCode').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }),
  body('agentName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('contacts').optional().isArray(),
  body('contacts.*.email').optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail(),
  body('contacts.*.contactPerson').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }),
  body('contacts.*.mobile').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 30 }),
  body('contacts.*.description').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  body('status').optional().isIn(AGENT_STATUS),
  handle,
];

module.exports = { validateCreate, validateUpdate };
