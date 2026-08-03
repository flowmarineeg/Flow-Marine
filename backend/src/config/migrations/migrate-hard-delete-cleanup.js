'use strict';

/**
 * migrate-hard-delete-cleanup.js — Sprint 047
 *
 * Sprint 047 converts every soft-deletable entity (except User) from
 * `isDeleted`-flag soft delete to real hard delete, and removes the
 * `isDeleted`/`deletedAt` fields from each model's schema.
 *
 * This is a MANDATORY, one-time cleanup that must run before (or as the
 * very first step of) that change going live: once the application no
 * longer filters queries by `isDeleted: false`, any row still sitting with
 * `isDeleted: true` in the database would instantly reappear in every
 * list/report/dropdown, since nothing excludes it anymore. This script
 * permanently removes those rows first.
 *
 * Uses raw collection access (Model.collection.deleteMany), not the
 * Mongoose model's own query builder — the model's schema no longer
 * declares `isDeleted` at all post-Sprint-047, so a query built through the
 * model could be stripped/cast away; going through the native driver
 * targets the field directly, regardless of what the current schema
 * declares. Same raw-collection precedent already used by
 * migrate-invoice-v2.js for reading fields no longer in a model's schema.
 *
 * NOT auto-run from server.js or seed.js — run manually:
 *   node src/config/migrations/migrate-hard-delete-cleanup.js
 *
 * File lives at: src/config/migrations/ — paths up to src/ require ../../
 */

const connectDB = require('../db');
const logger    = require('../../utils/logger');

// Every model Sprint 047 converts to hard delete. User is the sole,
// deliberate exception (stays soft-delete) and is NOT included here.
// Route is also excluded — its `isDeleted` field was dead code (never set
// to true by any code path), so there is nothing to purge for it.
const MODELS = [
  { name: 'Vessel',          path: '../../modules/vessels/vessel.model' },
  { name: 'Agent',           path: '../../modules/agents/agent.model' },
  { name: 'Service',         path: '../../modules/services/service.model' },
  { name: 'Round',           path: '../../modules/rounds/round.model' },
  { name: 'Booking',         path: '../../modules/bookings/booking.model' },
  { name: 'ManualBooking',   path: '../../modules/bookings/manualBooking.model' },
  { name: 'Invoice',         path: '../../modules/invoices/invoice.model' },
  { name: 'ContainerType',   path: '../../modules/containerTypes/containerType.model' },
  { name: 'ExpenseType',     path: '../../modules/expenseTypes/expenseType.model' },
  { name: 'Role',            path: '../../modules/roles/role.model' },
  { name: 'Country',         path: '../../modules/locations/country.model' },
  { name: 'City',            path: '../../modules/locations/city.model' },
  { name: 'Port',            path: '../../modules/locations/port.model' },
  { name: 'Terminal',        path: '../../modules/locations/terminal.model' },
];

const migrate = async () => {
  let totalRemoved = 0;

  for (const { name, path } of MODELS) {
    const Model = require(path);
    const result = await Model.collection.deleteMany({ isDeleted: true });
    if (result.deletedCount > 0) {
      logger.info(`[Migration] migrate-hard-delete-cleanup: removed ${result.deletedCount} soft-deleted ${name} document(s)`);
    }
    totalRemoved += result.deletedCount;
  }

  logger.info(`[Migration] migrate-hard-delete-cleanup: done — ${totalRemoved} document(s) permanently removed across ${MODELS.length} model(s)`);
};

if (require.main === module) {
  connectDB()
    .then(() => migrate())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(`[Migration] migrate-hard-delete-cleanup failed: ${err.message}`);
      process.exit(1);
    });
}

module.exports = migrate;
