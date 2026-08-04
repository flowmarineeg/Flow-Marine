'use strict';

/**
 * migrate-dashboard-auditlogs.js
 *
 * Sets dashboard and auditLogs to hidden:true, read:false for every
 * non-SuperAdmin role. Idempotent — safe to run multiple times.
 * Called from seed.js before permission seeding.
 *
 * File lives at:  src/config/migrations/
 * So paths up to src/ require ../../  (not ../)
 */

const Permission = require('../../modules/permissions/permission.model');
const Role       = require('../../modules/roles/role.model');
const logger     = require('../../utils/logger');

const migrate = async () => {
  const nonAdminRoles = await Role.find({ isSystem: false }).lean();
  if (!nonAdminRoles.length) {
    logger.info('[Migration] No non-admin roles found — skipping dashboard lock');
    return;
  }

  const roleIds = nonAdminRoles.map(r => r._id);

  const result = await Permission.updateMany(
    {
      roleId: { $in: roleIds },
      module: { $in: ['dashboard', 'auditLogs'] },
    },
    {
      $set: {
        'actions.read':   false,
        'actions.create': false,
        'actions.update': false,
        'actions.delete': false,
        'actions.import': false,
        'actions.export': false,
        'actions.hidden': true,
      },
    }
  );

  logger.info(`[Migration] dashboard+auditLogs locked for non-admin roles — ${result.modifiedCount} docs updated`);
};

module.exports = migrate;
