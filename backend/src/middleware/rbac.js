'use strict';

const Permission = require('../modules/permissions/permission.model');
const { forbidden } = require('../utils/responseHelper');
const cache = require('../utils/cache');

const PERM_TTL = 120_000; // 120 seconds

const methodToAction = {
  GET:    'read',
  POST:   'create',
  PUT:    'update',
  PATCH:  'update',
  DELETE: 'delete',
};

/**
 * RBAC middleware factory — Sprint020
 *
 * Cache: permission doc cached 120s per roleId+module (PERF-002).
 * Invalidated by permission.service on save via cache.delByPrefix(`perm:${roleId}:`).
 *
 * @param {string} module          - module name e.g. 'vessels'
 * @param {string} [actionOverride] - force a specific action e.g. 'import'
 */
const rbac = (module, actionOverride) => async (req, res, next) => {
  try {
    if (req.user?.roleId?.isSystem) return next(); // SuperAdmin bypasses all checks

    const action = actionOverride || methodToAction[req.method] || 'read';
    const roleId = String(req.user?.roleId?._id || req.user?.roleId);
    const cacheKey = `perm:${roleId}:${module}`;

    // ── Cache lookup ────────────────────────────────────────────────────────
    let permission = cache.get(cacheKey);

    if (!permission) {
      permission = await Permission.findOne({ roleId, module }).lean();
      if (permission) cache.set(cacheKey, permission, PERM_TTL);
    }

    if (!permission)               return forbidden(res, `No permissions configured for module: ${module}`);
    if (permission.actions.hidden) return forbidden(res, 'Access to this module is restricted');
    if (!permission.actions[action]) return forbidden(res, `Permission denied: cannot ${action} ${module}`);

    next();
  } catch (err) {
    next(err);
  }
};

// Sprint046 — programmatic (non-gating) permission check for use inside a
// controller, e.g. "does this user ALSO have invoices:override", on top of
// the base rbac('invoices') gate already applied at the route level. Same
// cached lookup as the middleware above, just returns a boolean instead of
// calling next()/forbidden().
const hasPermission = async (req, module, action) => {
  if (req.user?.roleId?.isSystem) return true; // SuperAdmin bypasses all checks

  const roleId = String(req.user?.roleId?._id || req.user?.roleId);
  const cacheKey = `perm:${roleId}:${module}`;

  let permission = cache.get(cacheKey);
  if (!permission) {
    permission = await Permission.findOne({ roleId, module }).lean();
    if (permission) cache.set(cacheKey, permission, PERM_TTL);
  }

  return !!permission?.actions?.[action];
};

module.exports = rbac;
module.exports.hasPermission = hasPermission;
