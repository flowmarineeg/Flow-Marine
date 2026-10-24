'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const router  = express.Router();
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const svc     = require('./agentAccounts.service');
const { success, created, badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  next();
};
const wrap = (fn, msg, make = success) => async (req, res, next) => {
  try { return make(res, await fn(req), msg); } catch (e) { next(e); }
};

const money = [
  body('amountMinor').isInt({ min: 1 }).toInt(),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }),
  body('date').optional().isISO8601(),
  body('method').optional().isIn(['Bank Transfer', 'Cash', 'Cheque', 'Other']),
  body('bankAccount.type').optional().isIn(['Company', 'Partner']),
  body('bankAccount.partnerId').optional({ nullable: true }).isMongoId(),
  handle,
];

router.use(auth);

// ── Settlement statements (by statement id; registered before /:agentId) ──────
router.post('/statements/:id/agree', rbac('agents', 'offset'), audit('agents'),
  wrap((req) => svc.agreeStatement(req.params.id), 'Statement agreed'));
router.post('/statements/:id/settle', rbac('agents', 'offset'), audit('agents'),
  wrap((req) => svc.settleStatement(req.params.id, req.user._id), 'Statement settled'));

// ── Agent statement of account ───────────────────────────────────────────────
router.get('/:agentId/soa', rbac('agents'),
  wrap((req) => svc.soa(req.params.agentId, req.query)));

// ── Cash movements with the agent ────────────────────────────────────────────
router.post('/:agentId/advance', rbac('agents', 'offset'), audit('agents'), money,
  wrap((req) => svc.advance(req.params.agentId, req.body, req.user._id), 'Advance recorded', created));
router.post('/:agentId/advance-return', rbac('agents', 'offset'), audit('agents'), money,
  wrap((req) => svc.returnAdvance(req.params.agentId, req.body, req.user._id), 'Advance return recorded', created));
router.post('/:agentId/pay', rbac('agents', 'offset'), audit('agents'), money,
  wrap((req) => svc.payAgent(req.params.agentId, req.body, req.user._id), 'Payment recorded', created));

// ── Netting ──────────────────────────────────────────────────────────────────
router.post('/:agentId/offset', rbac('agents', 'offset'), audit('agents'), [
  body('batchId').isString().trim().notEmpty(),
  body('strategy').optional().isIn(['oldest', 'sameRound']),
  body('roundId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }),
  handle,
], wrap((req) => svc.offset(req.params.agentId, req.body, req.user._id), 'Offset applied'));
router.post('/:agentId/offset/:batchId/reverse', rbac('agents', 'offset'), audit('agents'),
  [body('reason').isString().trim().notEmpty(), handle],
  wrap((req) => svc.reverseOffset(req.params.agentId, req.params.batchId, req.body.reason, req.user._id), 'Offset reversed'));

// ── Handling charges (preview -> confirm) ────────────────────────────────────
router.get('/:agentId/handling', rbac('agents'), wrap((req) => svc.listHandling(req.params.agentId, req.query.roundId)));
router.get('/:agentId/handling/preview', rbac('agents'), [query('roundId').isMongoId(), handle],
  wrap((req) => svc.handlingPreview(req.params.agentId, req.query.roundId)));
router.post('/:agentId/handling/confirm', rbac('agents', 'offset'), audit('agents'),
  [body('roundId').isMongoId(), handle],
  wrap((req) => svc.handlingConfirm(req.params.agentId, req.body.roundId, req.user._id), 'Handling charges generated', created));

// ── Final settlement statement ───────────────────────────────────────────────
router.get('/:agentId/statement', rbac('agents'), [query('roundId').isMongoId(), handle],
  wrap((req) => svc.getStatement(req.params.agentId, req.query.roundId, req.query.currency)));
router.post('/:agentId/statement', rbac('agents', 'offset'), audit('agents'),
  [body('roundId').isMongoId(), handle],
  wrap((req) => svc.buildStatement(req.params.agentId, req.body.roundId, req.body, req.user._id), 'Statement prepared'));

// ── Agreements (handling fee table + commission rule) ────────────────────────
const agreementRules = [
  body('validFrom').isISO8601(), body('validTo').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }),
  body('handlingFees').optional().isArray(),
  body('handlingFees.*.moveType').isIn(['Load', 'Discharge']),
  body('handlingFees.*.containerStatus').isIn(['Full', 'Empty']),
  body('handlingFees.*.amountMinor').isInt({ min: 0 }).toInt(),
  body('commission.rule').optional({ nullable: true }).isIn(['fixedPerContainer', 'fixedPerBooking', 'percentOfRate']),
  body('commission.amountMinor').optional().isInt({ min: 0 }).toInt(),
  body('commission.percentBp').optional().isInt({ min: 0, max: 10000 }).toInt(),
  handle,
];
// Commission control (audit H7): see, and cancel with a reason. commission = commission.manage.
router.get('/:agentId/commissions', rbac('agents'), wrap((req) => svc.listCommissions(req.params.agentId, req.query)));
router.post('/commissions/:id/cancel', rbac('agents', 'commission'), audit('agents'),
  [body('reason').isString().trim().notEmpty(), handle],
  wrap((req) => svc.cancelCommission(req.params.id, req.body.reason, req.user), 'Commission cancelled'));

router.get('/:agentId/agreements', rbac('agents'), wrap((req) => svc.listAgreements(req.params.agentId)));
router.post('/:agentId/agreements', rbac('agents', 'update'), audit('agents'), agreementRules,
  wrap((req) => svc.saveAgreement(req.params.agentId, null, req.body, req.user._id), 'Agreement saved', created));
router.put('/:agentId/agreements/:id', rbac('agents', 'update'), audit('agents'), agreementRules,
  wrap((req) => svc.saveAgreement(req.params.agentId, req.params.id, req.body, req.user._id), 'Agreement saved'));
router.delete('/:agentId/agreements/:id', rbac('agents', 'update'), audit('agents'),
  wrap((req) => svc.deleteAgreement(req.params.agentId, req.params.id), 'Agreement deleted'));

module.exports = router;
