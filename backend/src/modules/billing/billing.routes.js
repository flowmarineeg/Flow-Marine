'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const router  = express.Router();
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const items   = require('./bookingItem.service');
const svc     = require('./invoiceV2.service');
const { generateInvoicePdf } = require('../../utils/invoicePdfGenerator');
const { success, created, badRequest, paginate } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })));
  next();
};
const wrap = (fn, msg, make = success) => async (req, res, next) => {
  try { return make(res, await fn(req), msg); } catch (e) { next(e); }
};

router.use(auth);

// Wizard step 2: items the bill-to party can still be invoiced for.
router.get('/items', rbac('invoices'), wrap((req) => items.listEligible(req.query)));


// ─── Reads: list, detail, PDF ─────────────────────────────────────────────────
router.get('/', rbac('invoices'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, agentId = '', status = '', invoiceType = '', docKind = '', dateFrom = '', dateTo = '' } = req.query;
    const { data, total } = await svc.list({ page, limit, agentId, status, invoiceType, docKind, dateFrom, dateTo });
    return success(res, data, 'Invoices retrieved', 200, paginate(total, page, limit));
  } catch (e) { next(e); }
});

router.get('/:id/pdf', rbac('invoices'), async (req, res, next) => {
  try {
    const invoice = await svc.getByIdForPdf(req.params.id);
    const pdfBuffer = await generateInvoicePdf(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (e) { next(e); }
});

router.post('/', rbac('invoices'), audit('invoices'), [
  body('invoiceType').isIn(['Booking', 'Voyage', 'Round']),
  body('billToAgentId').isMongoId(),
  body('itemIds').isArray({ min: 1 }),
  body('itemIds.*').isMongoId(),
  body('invoiceDate').isISO8601(),
  body('dueDate').isISO8601(),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  handle,
], wrap((req) => svc.createDraft(req.body, req.user._id), 'Draft invoice created', created));

router.put('/:id', rbac('invoices'), audit('invoices'), [
  body('invoiceDate').optional().isISO8601(), body('dueDate').optional().isISO8601(),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 1000 }), handle,
], wrap((req) => svc.updateDraft(req.params.id, req.body, req.user._id), 'Draft updated'));

router.post('/:id/issue', rbac('invoices', 'issue'), audit('invoices'),
  wrap((req) => svc.issue(req.params.id, req.user._id), 'Invoice issued'));

router.post('/:id/cancel', rbac('invoices', 'cancel'), audit('invoices'), [body('reason').isString().trim().notEmpty(), handle],
  wrap((req) => svc.cancel(req.params.id, req.body.reason, req.user._id, { cancelCommission: req.body.cancelCommission === true }), 'Invoice cancelled'));

router.get('/:id/settlements', rbac('invoices'), wrap((req) => svc.listSettlements(req.params.id)));

router.post('/:id/settlements', rbac('invoices', 'record'), audit('invoices'), [
  body('amountMinor').isInt({ min: 1 }).toInt(),
  body('date').optional().isISO8601(),
  body('method').optional().isIn(['Bank Transfer', 'Cash', 'Cheque', 'Other']),
  body('bankAccount.type').optional().isIn(['Company', 'Partner']),
  body('bankAccount.partnerId').optional({ nullable: true }).isMongoId(),
  body('reference').optional({ nullable: true }).isString().isLength({ max: 200 }),
  handle,
], wrap((req) => svc.recordSettlement(req.params.id, req.body, req.user._id), 'Settlement recorded', created));

router.post('/:id/settlements/:sid/void', rbac('invoices', 'record'), audit('invoices'), [body('reason').isString().trim().notEmpty(), handle],
  wrap((req) => svc.voidSettlement(req.params.id, req.params.sid, req.body.reason, req.user._id), 'Settlement voided'));

const noteValidators = [
  body('amountMinor').isInt({ min: 1 }).toInt(), body('reason').isString().trim().notEmpty(),
  body('date').optional().isISO8601(), body('dueDate').optional().isISO8601(), handle,
];
router.post('/:id/credit-note', rbac('invoices', 'issue'), audit('invoices'), noteValidators,
  wrap((req) => svc.createNote(req.params.id, 'CreditNote', req.body, req.user._id), 'Credit note issued', created));
router.post('/:id/debit-note', rbac('invoices', 'issue'), audit('invoices'), noteValidators,
  wrap((req) => svc.createNote(req.params.id, 'DebitNote', req.body, req.user._id), 'Debit note issued', created));

router.get('/:id', rbac('invoices'), wrap((req) => svc.getById(req.params.id)));

const optText = (f, max) => body(f).optional({ nullable: true, checkFalsy: true }).isString().isLength({ max });
router.put('/:id/bill-to', rbac('invoices'), audit('invoices'), [
  optText('phone', 50), optText('mobile', 50), optText('email', 150), optText('jobCode', 100),
  optText('taxId', 100), optText('address', 300), optText('office', 150), handle,
], wrap((req) => svc.updateBillTo(req.params.id, req.body), 'Bill To details updated'));

router.delete('/:id', rbac('invoices'), audit('invoices'), wrap((req) => svc.deleteById(req.params.id).then(() => null), 'Draft invoice deleted'));

module.exports = router;
