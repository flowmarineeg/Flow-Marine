'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./capacity.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');

router.use(auth);

// GET /api/v1/capacity/round/:roundId
router.get('/round/:roundId',          rbac('rounds'),   ctrl.getRoundCapacity);

// GET /api/v1/capacity/vessel/:vesselId/active
router.get('/vessel/:vesselId/active', rbac('vessels'),  ctrl.getVesselActiveCapacity);

// POST /api/v1/capacity/preview  (Phase 4 — pre-flight enforcement)
router.post('/preview',                rbac('bookings'), ctrl.previewCapacity);

module.exports = router;
