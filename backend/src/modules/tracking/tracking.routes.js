'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./tracking.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate } = require('./tracking.validation');

router.use(auth);

// No PUT, no DELETE — tracking history is immutable
router.get('/',                   rbac('tracking'), ctrl.listEntries);       // NEW — list with filters
router.get('/latest',             rbac('tracking'), ctrl.getLatestPositions); // BEFORE /:voyageId
router.get('/:voyageId/history',  rbac('tracking'), ctrl.getHistory);
router.post('/',                  rbac('tracking'), audit('tracking'), validateCreate, ctrl.createEntry);

module.exports = router;
