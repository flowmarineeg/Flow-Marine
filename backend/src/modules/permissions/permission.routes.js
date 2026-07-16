'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./permission.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');

router.use(auth);
// GET is self-service — any authenticated user must be able to fetch their own
// role's permissions. Protecting this with rbac('roles') causes a chicken-and-egg
// deadlock: non-admin users 403 here before their permMap is ever loaded.
// Only the write (PUT) requires admin-level 'roles' permission.
router.get('/:roleId',  ctrl.getByRoleId);
router.put('/:roleId',  rbac('roles'), audit('permissions'), ctrl.saveByRoleId);

module.exports = router;
