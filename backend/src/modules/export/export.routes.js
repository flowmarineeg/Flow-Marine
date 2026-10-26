'use strict';

const express    = require('express');
const router     = express.Router();
const ctrl       = require('./export.controller');
const auth       = require('../../middleware/auth');
const rbac       = require('../../middleware/rbac');
const Permission = require('../permissions/permission.model');
const { forbidden } = require('../../utils/responseHelper');

/**
 * Sprint019 — per-module export permission check.
 * After rbac('export') passes, verify the caller also has `export` action
 * on the specific module(s) being requested.
 */
const checkModuleExportPermission = async (req, res, next) => {
  try {
    // SuperAdmin bypasses
    if (req.user?.roleId?.isSystem) return next();

    const roleId = req.user?.roleId?._id || req.user?.roleId;

    // Collect requested module names
    let requestedModules = [];
    if (req.body.module) {
      // Single export (excel)
      requestedModules = [req.body.module];
    } else if (Array.isArray(req.body.exports)) {
      // ZIP export — multiple modules
      requestedModules = req.body.exports.map(e => e.module).filter(Boolean);
    }

    // Check each requested module
    const denied = [];
    for (const mod of requestedModules) {
      // manualBookings is not a permission module - it is governed by the bookings permission (F-08)
      const permModule = mod === 'manualBookings' ? 'bookings' : mod;
      const perm = await Permission.findOne({ roleId, module: permModule }).lean();
      if (!perm || !perm.actions.export) {
        denied.push(mod);
      }
    }

    if (denied.length > 0) {
      return forbidden(res, `Export not permitted for module(s): ${denied.join(', ')}`);
    }

    next();
  } catch (err) {
    next(err);
  }
};

router.use(auth);
// Sprint019: added rbac('export') + per-module export permission check
router.post('/excel', rbac('export'), checkModuleExportPermission, ctrl.exportExcel);
router.post('/zip',   rbac('export'), checkModuleExportPermission, ctrl.exportZip);

module.exports = router;
