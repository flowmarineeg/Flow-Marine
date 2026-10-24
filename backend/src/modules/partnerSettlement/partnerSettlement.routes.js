'use strict';

const express = require('express');
const ExcelJS = require('exceljs');
const { body, validationResult } = require('express-validator');
const router  = express.Router();
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const ps      = require('./partnerSettlement.service');
const rc      = require('./roundClose.service');
const { fromMinor } = require('../../utils/money');
const { success, created, badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  next();
};
const wrap = (fn, msg, make = success) => async (req, res, next) => {
  try { return make(res, await fn(req), msg); } catch (e) { next(e); }
};

router.use(auth);

// ── Round closing ────────────────────────────────────────────────────────────
router.get('/rounds/:id/checklist', rbac('rounds'), wrap((req) => rc.checklist(req.params.id)));
router.post('/rounds/:id/ready', rbac('rounds', 'close'), wrap((req) => rc.markReady(req.params.id, req.user), 'Round marked ready to close'));
router.post('/rounds/:id/close', rbac('rounds', 'close'), [
  body('carryForwardMinor').optional().isInt({ min: 0 }).toInt(),
  body('mode').optional().isIn(['Accrual', 'Cash']),
  body('overrideReason').optional({ nullable: true }).isString().isLength({ max: 500 }),
  handle,
], wrap(async (req) => rc.close(req.params.id, req.body, req.user, {
  canOverride: await rbac.hasPermission(req, 'rounds', 'closeOverride'),
  canCarryForward: await rbac.hasPermission(req, 'rounds', 'carryForward'),
}), 'Round closed'));
router.post('/rounds/:id/reopen', rbac('rounds', 'reopen'), [body('reason').isString().trim().notEmpty(), handle],
  wrap((req) => rc.reopen(req.params.id, req.body.reason, req.user), 'Round reopened'));

// ── Partner settlement ───────────────────────────────────────────────────────
router.get('/rounds/:id/partner-settlement', rbac('rounds'),
  wrap((req) => ps.getSettlement(req.params.id, req.query.currency)));
router.post('/rounds/:id/partner-settlement', rbac('partners', 'manage'), audit('partners'), [
  body('carryForwardMinor').optional().isInt({ min: 0 }).toInt(), body('mode').optional().isIn(['Accrual', 'Cash']), handle,
], wrap((req) => ps.calculate(req.params.id, req.body, req.user), 'Settlement calculated'));

router.post('/transfers/:id/pay', rbac('partners', 'manage'), audit('partners'),
  wrap((req) => ps.payTransfer(req.params.id, req.body, req.user), 'Transfer recorded as paid'));
router.post('/transfers/:id/unpay', rbac('partners', 'manage'), audit('partners'),
  [body('reason').isString().trim().notEmpty(), handle],
  wrap((req) => ps.unpayTransfer(req.params.id, req.body.reason, req.user), 'Transfer payment reversed'));

// Excel sheet for the JV Partners Settlement report (S6)
router.get('/rounds/:id/partner-settlement/excel', rbac('reports'), async (req, res, next) => {
  try {
    const s = await ps.getSettlement(req.params.id, req.query.currency);
    if (!s) return badRequest(res, 'No settlement has been calculated for this Round yet');
    const cur = s.currency;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Partner Settlement');
    ws.addRow(['JV Partners Settlement Sheet']).font = { bold: true, size: 14 };
    ws.addRow(['Status', s.status, 'Basis', s.mode, 'Currency', cur]);
    ws.addRow([]);
    ws.addRow(['Revenue', fromMinor(s.revenueMinor, cur), 'Expenses', fromMinor(s.expenseMinor, cur), 'Profit', fromMinor(s.profitMinor, cur)]);
    ws.addRow(['Carry forward (reserve)', fromMinor(s.carryForwardMinor, cur), 'Distributable', fromMinor(s.distributableMinor, cur)]);
    ws.addRow([]);
    const h = ws.addRow(['Partner', 'Share %', 'Profit share', 'Paid directly', 'Collected directly', 'Net (+receives / -pays)']);
    h.font = { bold: true };
    s.partners.forEach((p) => ws.addRow([p.partner?.name || String(p.partnerId), p.shareBp / 100, fromMinor(p.shareMinor, cur), fromMinor(p.paidDirectMinor, cur), fromMinor(p.collectedDirectMinor, cur), fromMinor(p.netMinor, cur)]));
    ws.addRow([]);
    ws.addRow(['Suggested transfers']).font = { bold: true };
    ws.addRow(['From', 'To', 'Amount', 'Status']).font = { bold: true };
    s.transfers.forEach((t) => ws.addRow([t.from?.name, t.to?.name, fromMinor(t.amountMinor, cur), t.status]));
    ws.columns.forEach((c) => { c.width = 24; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="partner-settlement.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

// ── JV reserve ───────────────────────────────────────────────────────────────
router.get('/vessels/:id/reserve', rbac('vessels'), wrap((req) => ps.listReserve(req.params.id)));
router.post('/reserve/use', rbac('rounds', 'useReserve'), audit('rounds'), [
  body('expenseId').isMongoId(), body('amountMinor').isInt({ min: 1 }).toInt(), handle,
], wrap((req) => ps.useReserve(req.body, req.user), 'Reserve applied', created));

module.exports = router;
