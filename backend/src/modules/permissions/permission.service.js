'use strict';

const Permission = require('./permission.model');
const cache      = require('../../utils/cache');
const { MODULES } = require('../../config/constants');

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

const saveByRoleId = async (roleId, permissions, updatedBy) => {
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
