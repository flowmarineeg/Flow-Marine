'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./user.controller');
const authMiddleware = require('../../middleware/auth');
const rbac = require('../../middleware/rbac');
const auditLogger = require('../../middleware/auditLogger');
const { validateCreate, validateInvite, validateAcceptInvite, validateUpdate } = require('./user.validation');

// Public — accept invite (no auth needed)
router.post('/accept-invite', validateAcceptInvite, controller.acceptInvite);

// All routes below require auth + users permission
router.use(authMiddleware);

router.get('/',                    rbac('users'), controller.list);
router.get('/:id',                 rbac('users'), controller.getById);
router.post('/',     auditLogger('users'), rbac('users'), validateCreate,  controller.create);
router.post('/invite', auditLogger('users'), rbac('users'), validateInvite, controller.inviteUser);
router.post('/:id/resend-invite', auditLogger('users'), rbac('users'), controller.resendInvite);
router.put('/:id',   auditLogger('users'), rbac('users'), validateUpdate,  controller.update);
router.delete('/:id', auditLogger('users'), rbac('users'), controller.remove);

module.exports = router;
