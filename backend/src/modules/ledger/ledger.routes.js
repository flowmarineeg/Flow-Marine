'use strict';

const express = require('express');
const router  = express.Router();
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const ledger  = require('./ledger.service');
const fx      = require('./fx.service');
const Account = require('./account.model');
const { success, created } = require('../../utils/responseHelper');

router.use(auth);

router.get('/accounts', rbac('ledger'), async (req, res, next) => {
  try { return success(res, await Account.find({}).sort({ code: 1 }).lean()); } catch (e) { next(e); }
});

// Minimal read for master-data dropdowns (services, expense types): any signed-in user, no balances.
router.get('/account-lookup', async (req, res, next) => {
  try {
    const { rule } = req.query;
    const { RULES } = require('./accountRules');
    const Account = require('./account.model');
    const r = RULES[rule];
    const query = { isActive: true, ...(r ? { type: r.type, code: { $regex: `^${r.prefix}` } } : {}) };
    return success(res, await Account.find(query).select('code name type').sort({ code: 1 }).lean());
  } catch (e) { next(e); }
});
router.get('/trial-balance', rbac('ledger'), async (req, res, next) => {
  try {
    const { roundId, dateFrom, dateTo } = req.query;
    return success(res, await ledger.trialBalance({ roundId, dateFrom, dateTo }));
  } catch (e) { next(e); }
});

// FX table. Reading is plain ledger:read; writing a rate is the ledger:manage
// action (the spec's fx.override hook, D7).
router.get('/exchange-rates', rbac('ledger'), async (req, res, next) => {
  try { return success(res, await fx.list(req.query)); } catch (e) { next(e); }
});
router.put('/exchange-rates', rbac('ledger', 'manage'), audit('ledger'), async (req, res, next) => {
  try { return created(res, await fx.setRate(req.body, req.user._id), 'Exchange rate saved'); } catch (e) { next(e); }
});

module.exports = router;
