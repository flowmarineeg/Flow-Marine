'use strict';

const Permission = require('./permission.model');
const cache      = require('../../utils/cache');
const { MODULES } = require('../../config/constants');
const AppError   = require('../../utils/AppError');

const getByRoleId = async (roleId) => {
  const existing = await Permission.find({ roleId }).lean();
  return MODULES.map((mod) => {
    const found = existing.find((p) => p.module === mod);
    return found || {
      roleId,
      module:  mod,
      actions: { create: false, read: false, update: false, delete: false, view: false, hidden: false },
    };
  });
};

const ACTION_KEYS = Object.keys(Permission.schema.path('actions').schema.paths).filter((k) => k !== '_id');

const saveByRoleId = async (roleId, permissions, updatedBy) => {
  // bulkWrite skips schema validators, so check here: known modules only, known boolean actions only (F-09)
  if (!Array.isArray(permissions)) throw new AppError(400, 'permissions must be an array', 'VALIDATION_ERROR');
  const bad = permissions.filter((p) => !p || !MODULES.includes(p.module));
  if (bad.length) throw new AppError(400, `Unknown permission module(s): ${bad.map((p) => p?.module).join(', ')}`, 'INVALID_MODULE');
  permissions = permissions.map((p) => ({
    module: p.module,
    actions: Object.fromEntries(ACTION_KEYS.map((k) => [k, p.actions?.[k] === true])),
  }));
  const ops = permissions.map((p) => ({
    updateOne: {
      filter: { roleId, module: p.module },
      update: { $set: { actions: p.actions, updatedBy } },
      upsert: true,
    },
  }));
  await Permission.bulkWrite(ops);

  // Invalidate all rbac cache entries for this role —
  // next request will re-fetch from DB with the new values (PERF-002)
  cache.delByPrefix(`perm:${String(roleId)}:`);

  return getByRoleId(roleId);
};

module.exports = { getByRoleId, saveByRoleId };
