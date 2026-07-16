'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./role.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');

const handle = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return badRequest(res, 'Validation failed', e.array().map(x => ({ field: x.path, message: x.msg })));
  next();
};

const validateRole = [
  body('name').trim().notEmpty().withMessage('Role name is required').isLength({ max: 100 }),
  body('description').optional().trim(),
  handle,
];

router.use(auth);
router.get('/',      rbac('roles'), ctrl.list);
router.get('/:id',   rbac('roles'), ctrl.getById);
router.post('/',     rbac('roles'), audit('roles'), validateRole, ctrl.create);
router.put('/:id',   rbac('roles'), audit('roles'), validateRole, ctrl.update);
router.delete('/:id', rbac('roles'), audit('roles'), ctrl.remove);

module.exports = router;
