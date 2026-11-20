'use strict';

const { forbidden } = require('../utils/responseHelper');

/**
 * F-09 (owner decision B, 2026-11-19): roles and permissions are changed by the SuperAdmin (system role) only.
 * `roles:update` etc. stay valid for READING roles and permission matrices, but they are no longer delegable for writes,
 * so nobody can grant themselves or another role more than they hold. Used after `rbac('roles')` on the write routes.
 */
const superAdminOnly = (req, res, next) => {
  if (req.user?.roleId?.isSystem === true) return next();
  return forbidden(res, 'Only the SuperAdmin can change roles and permissions');
};

module.exports = superAdminOnly;
