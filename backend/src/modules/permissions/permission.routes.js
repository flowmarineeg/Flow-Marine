'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./permission.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { forbidden } = require('../../utils/responseHelper');

const ownRoleId = (req) => String(req.user?.roleId?._id || req.user?.roleId);

// Sprint049 (Sprint041 ADR-1, audit H2): GET stays self-service for the
// caller's OWN role — required to avoid the chicken-and-egg deadlock where a
// non-admin 403s before its permission map ever loads. Any OTHER role's
// matrix needs the same 'roles' permission the PUT route already requires.
const ownRoleOrRoles = (req, res, next) => {
  if (req.user?.roleId?.isSystem || String(req.params.roleId) === ownRoleId(req)) return next();
  return rbac('roles')(req, res, next);
};

// Sprint049 (audit M6): a role may never rewrite its own permissions —
// otherwise any role holding roles:update could promote itself. Only the
// SuperAdmin (system role) may edit the role it belongs to.
const notOwnRole = (req, res, next) => {
  if (req.user?.roleId?.isSystem) return next();
  if (String(req.params.roleId) === ownRoleId(req)) {
    return forbidden(res, 'You cannot change the permissions of your own role');
  }
  next();
};

router.use(auth);
router.get('/:roleId',  ownRoleOrRoles, ctrl.getByRoleId);
router.put('/:roleId',  rbac('roles'), notOwnRole, audit('permissions'), ctrl.saveByRoleId);

module.exports = router;
