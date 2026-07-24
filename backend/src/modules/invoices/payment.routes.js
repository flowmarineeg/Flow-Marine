'use strict';

// Top-level /api/v1/payments — currently just the Agent Details "Payments" tab
// list (GET /payments?agentId=). Per-invoice payment actions (create/void/list)
// are nested under /api/v1/invoices/:id/payments — see invoice.routes.js.
const express = require('express');
const router  = express.Router();
const ctrl    = require('./payment.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');

router.use(auth);
router.get('/', rbac('invoices'), ctrl.list);

module.exports = router;
