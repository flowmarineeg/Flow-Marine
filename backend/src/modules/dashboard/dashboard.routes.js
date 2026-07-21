'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./dashboard.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');

router.use(auth);
router.get('/stats',             rbac('dashboard'), ctrl.getStats);
router.get('/fleet-utilisation', rbac('dashboard'), ctrl.getFleetUtilisation); // Sprint 022

module.exports = router;
