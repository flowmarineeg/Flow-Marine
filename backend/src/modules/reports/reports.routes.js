'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./reports.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');

router.use(auth);
router.use(rbac('reports'));

router.get('/round-pnl',           ctrl.getRoundPnL);
router.get('/voyage-performance',   ctrl.getVoyagePerformance);
router.get('/bookings',             ctrl.getBookingReport);
router.get('/revenue',              ctrl.getRevenueReport);
router.get('/expenses',             ctrl.getExpenseReport);
router.get('/round-capacity',       ctrl.getRoundCapacityReport);

module.exports = router;
