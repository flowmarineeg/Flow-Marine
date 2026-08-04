'use strict';

const express    = require('express');
const router     = express.Router();
const ctrl       = require('./booking.controller');
const importCtrl = require('./bookingImport.controller');
const manualCtrl = require('./manualBooking.controller');
const auth       = require('../../middleware/auth');
const rbac       = require('../../middleware/rbac');
const audit      = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate }                           = require('./booking.validation');
const { validateCreate: validateManualCreate,
        validateUpdate: validateManualUpdate }                     = require('./manualBooking.validation');

router.use(auth);

// ── Layer 1 — Manual Bookings (commercial reservation) ──────────────────────
// MUST be before /:id routes so 'manual' is not captured as an id param.
router.get   ('/manual',     rbac('bookings'),                         manualCtrl.list);
router.post  ('/manual',     rbac('bookings'), audit('bookings'), validateManualCreate, manualCtrl.create);
router.get   ('/manual/:id', rbac('bookings'),                         manualCtrl.getById);
router.put   ('/manual/:id', rbac('bookings'), audit('bookings'), validateManualUpdate, manualCtrl.update);
router.delete('/manual/:id', rbac('bookings'), audit('bookings'),      manualCtrl.remove);

// ── Import routes — BEFORE /:id to avoid shadowing ───────────────────────────
// Sprint019: preview + save both require 'import' action on bookings
// save in finalLoading mode additionally requires 'update' + 'delete'
// Sprint 042 — template-columns/template are read-only, same 'import' guard,
// no audit() (nothing is mutated by downloading a blank template).
router.get('/import/template-columns', rbac('bookings', 'import'), importCtrl.templateColumns);
router.get('/import/template',         rbac('bookings', 'import'), importCtrl.downloadTemplate);
router.post('/import/preview', rbac('bookings', 'import'), importCtrl.preview);
router.post('/import/save',    rbac('bookings', 'import'), audit('bookings'), async (req, res, next) => {
  // Both Final Loading AND Discharge reconciliation bulk-mutate bookings
  // that were never explicitly selected by the caller — Final Loading
  // cancels every booking absent from the manifest; Discharge
  // (bookingImport.service.js#saveDischargeImport) flags every OTHER
  // Final Loading booking for that agent on the voyage as 'Remaining'.
  // Post-audit fix (system-audit-2026-8-3.md §2.2): 'discharge' used to
  // fall through to the base 'import' check alone, letting a role with
  // only import-permission silently flip other bookings' discharge
  // status file-wide. Both import types now require the same elevated
  // update+delete check, not just 'import'.
  if (['finalLoading', 'discharge'].includes(req.body.importType) && !req.user?.roleId?.isSystem) {
    const Permission = require('../permissions/permission.model');
    const roleId = req.user?.roleId?._id || req.user?.roleId;
    const perm = await Permission.findOne({ roleId, module: 'bookings' }).lean();
    if (!perm?.actions?.update || !perm?.actions?.delete) {
      const label = req.body.importType === 'finalLoading' ? 'Final Loading' : 'Discharge';
      return res.status(403).json({
        success: false,
        message: `${label} import requires update and delete permissions on bookings`,
      });
    }
  }
  next();
}, importCtrl.save);

// Voyage port lookup — used by booking form dropdown
router.get('/voyage-ports/:voyageId', rbac('bookings'), ctrl.getVoyagePorts);

// Sprint 027: Discharge List export — BEFORE /:id to avoid route shadowing
router.get('/export/discharge-list', rbac('bookings', 'export'), ctrl.exportDischargeList);

router.get('/',      rbac('bookings'), ctrl.list);
router.get('/:id',   rbac('bookings'), ctrl.getById);
router.post('/',     rbac('bookings'), audit('bookings'), validateCreate, ctrl.create);
router.put('/:id',   rbac('bookings'), audit('bookings'), validateUpdate, ctrl.update);
router.delete('/:id',rbac('bookings'), audit('bookings'), ctrl.remove);

module.exports = router;
