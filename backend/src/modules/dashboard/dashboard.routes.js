'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./dashboard.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');

router.use(auth);
router.get('/stats', rbac('dashboard'), ctrl.getStats); // Sprint019: added RBAC

module.exports = router;
