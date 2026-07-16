'use strict';

const permService = require('./permission.service');
const { success, error } = require('../../utils/responseHelper');

const getByRoleId = async (req, res, next) => {
  try { return success(res, await permService.getByRoleId(req.params.roleId)); }
  catch (e) { next(e); }
};

const saveByRoleId = async (req, res, next) => {
  try {
    const data = await permService.saveByRoleId(req.params.roleId, req.body.permissions, req.user._id);
    return success(res, data, 'Permissions saved');
  } catch (e) { if (e.status) return error(res, e.message, e.status); next(e); }
};

module.exports = { getByRoleId, saveByRoleId };
