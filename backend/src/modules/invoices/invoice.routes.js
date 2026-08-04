'use strict';

const express = require('express');
const router  = express.Router();
const ctrl        = require('./invoice.controller');
const paymentCtrl = require('./payment.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate, validateBillTo } = require('./invoice.validation');
const { validateCreate: validatePaymentCreate, validateVoid: validatePaymentVoid } = require('./payment.validation');

router.use(auth);

router.get('/',                  rbac('invoices'), ctrl.list);
router.get('/eligible-bookings', rbac('invoices'), ctrl.eligibleBookings); // Decision 6
router.get('/:id/pdf',           rbac('invoices'), ctrl.downloadPdf); // Sprint020: PDF export

// Sprint 033 — per-invoice payments, nested under the invoice they belong to
router.get('/:id/payments',                    rbac('invoices'), paymentCtrl.listForInvoice);
router.post('/:id/payments',                   rbac('invoices'), audit('invoices'), validatePaymentCreate, paymentCtrl.create);
router.post('/:id/payments/:paymentId/void',   rbac('invoices'), audit('invoices'), validatePaymentVoid,   paymentCtrl.voidPayment);

router.get('/:id',     rbac('invoices'), ctrl.getById);
router.post('/',       rbac('invoices'), audit('invoices'), validateCreate, ctrl.create);
router.put('/:id',     rbac('invoices'), audit('invoices'), validateUpdate, ctrl.update);
// Sprint 047 — Bill To (PDF contact details), always editable regardless of
// the invoice's paid/locked state — separate route, separate lock-free path.
router.put('/:id/bill-to', rbac('invoices'), audit('invoices'), validateBillTo, ctrl.updateBillTo);
router.delete('/:id',  rbac('invoices'), audit('invoices'), ctrl.remove);

module.exports = router;
