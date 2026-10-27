'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const auth = require('../../middleware/auth');
const rbac = require('../../middleware/rbac');
const audit = require('../../middleware/auditLogger');
const svc = require('./accounting.service');
const { ACCOUNT_TYPES, SUBLEDGER_TYPES, ALLOCATION_LEVELS, DIMENSIONS } = require('../ledger/account.model');
const { success, created, badRequest } = require('../../utils/responseHelper');

router.use(auth);

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  next();
};
const shared = [
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('nameAr').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 120 }),
  body('isActive').optional().isBoolean().toBoolean(),
  body('subledgerType').optional().isIn(SUBLEDGER_TYPES),
  body('allocationLevel').optional().isIn(ALLOCATION_LEVELS),
  body('requiredDimensions').optional().isArray(),
  body('requiredDimensions.*').optional().isIn(DIMENSIONS),
  body('defaultCurrency').optional({ nullable: true, checkFalsy: true }).matches(/^[A-Za-z]{3}$/),
  body('normalBalance').optional({ nullable: true, checkFalsy: true }).isIn(['DEBIT', 'CREDIT']),
];

router.get('/accounts', rbac('accounting'), async (req, res, next) => {
  try { return success(res, await svc.list(req.query)); } catch (e) { next(e); }
});
router.get('/meta', rbac('accounting'), (req, res) => success(res, { types: ACCOUNT_TYPES, subledgerTypes: SUBLEDGER_TYPES, allocationLevels: ALLOCATION_LEVELS, dimensions: DIMENSIONS }));
router.post('/accounts', rbac('accounting'), audit('accounting'),
  body('code').isString().trim().notEmpty(), body('name').isString().trim().notEmpty(), body('parentId').isMongoId(), ...shared, handle,
  async (req, res, next) => { try { return created(res, await svc.create(req.body), 'Account created'); } catch (e) { next(e); } });
router.put('/accounts/:id', rbac('accounting'), audit('accounting'), ...shared, handle,
  async (req, res, next) => { try { return success(res, await svc.update(req.params.id, req.body), 'Account updated'); } catch (e) { next(e); } });

module.exports = router;
