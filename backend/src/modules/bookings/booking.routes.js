'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./booking.controller');
const importCtrl = require('./bookingImport.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { validateCreate, validateUpdate } = require('./booking.validation');

router.use(auth);

// Import routes — BEFORE /:id to avoid shadowing
// Sprint019: preview + save both require 'import' action on bookings
// save in finalLoading mode additionally requires 'update' + 'delete'
router.post('/import/preview', rbac('bookings', 'import'), importCtrl.preview);
router.post('/import/save',    rbac('bookings', 'import'), audit('bookings'), async (req, res, next) => {
  // Final Loading reconciliation cancels other bookings — requires update + delete
  if (req.body.importType === 'finalLoading' && !req.user?.roleId?.isSystem) {
    const Permission = require('../permissions/permission.model');
    const roleId = req.user?.roleId?._id || req.user?.roleId;
    const perm = await Permission.findOne({ roleId, module: 'bookings' }).lean();
    if (!perm?.actions?.update || !perm?.actions?.delete) {
      return res.status(403).json({
        success: false,
        message: 'Final Loading import requires update and delete permissions on bookings',
      });
    }
  }
  next();
}, importCtrl.save);

// Voyage port lookup — used by booking form dropdown
router.get('/voyage-ports/:voyageId', rbac('bookings'), ctrl.getVoyagePorts);

router.get('/',      rbac('bookings'), ctrl.list);
router.get('/:id',   rbac('bookings'), ctrl.getById);
router.post('/',     rbac('bookings'), audit('bookings'), validateCreate, ctrl.create);
router.put('/:id',   rbac('bookings'), audit('bookings'), validateUpdate, ctrl.update);
router.delete('/:id',rbac('bookings'), audit('bookings'), ctrl.remove);

module.exports = router;
