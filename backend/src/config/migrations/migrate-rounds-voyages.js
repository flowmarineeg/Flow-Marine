'use strict';

/**
 * migrate-rounds-voyages.js — Rounds/Voyages remediation (2026-10-26)
 *
 * Idempotent, never edits or deletes business records:
 *   1. Reports vessels that have more than one Active round (round numbers + ids). While any exist the
 *      unique index cannot be built, the script says so and exits non-zero. Resolve them by hand
 *      (complete or cancel the extra rounds in the app), then run it again.
 *   2. Creates the partial unique index `one_active_round_per_vessel` on rounds.vesselId (status Active).
 *   3. Reports rounds created before 2026-10-26 that have no routeSnapshot (informational: they keep
 *      using the live Service route; nothing is backfilled because the original route is unknown).
 *
 * Run manually (never from server.js / seed.js):
 *   node src/config/migrations/migrate-rounds-voyages.js [--dry]
 *
 * Backup first (mongodump of the `rounds` collection is enough). Rollback:
 *   db.rounds.dropIndex('one_active_round_per_vessel')
 */

require('dotenv').config();

const mongoose  = require('mongoose');
const connectDB = require('../db');
const logger    = require('../../utils/logger');

const INDEX_NAME = 'one_active_round_per_vessel';

const run = async ({ dry = false } = {}) => {
  const Round = require('../../modules/rounds/round.model');
  const coll  = Round.collection;

  // 1. Duplicate Active rounds
  const dupes = await coll.aggregate([
    { $match: { status: 'Active' } },
    { $group: { _id: '$vesselId', rounds: { $push: { id: '$_id', roundNumber: '$roundNumber' } }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();

  if (dupes.length) {
    logger.error(`[migrate-rounds-voyages] ${dupes.length} vessel(s) have more than one Active round:`);
    dupes.forEach(d => logger.error(`  vessel ${d._id}: ${d.rounds.map(r => `${r.roundNumber} (${r.id})`).join(', ')}`));
    logger.error('[migrate-rounds-voyages] Complete or cancel the extra rounds, then re-run. Index NOT created.');
    return { ok: false, duplicates: dupes.length };
  }

  // 2. Index
  const existing = (await coll.indexes()).find(i => i.name === INDEX_NAME);
  if (existing) {
    logger.info(`[migrate-rounds-voyages] index ${INDEX_NAME} already present`);
  } else if (dry) {
    logger.info(`[migrate-rounds-voyages] --dry: would create index ${INDEX_NAME}`);
  } else {
    await coll.createIndex({ vesselId: 1 }, { unique: true, partialFilterExpression: { status: 'Active' }, name: INDEX_NAME });
    logger.info(`[migrate-rounds-voyages] created index ${INDEX_NAME}`);
  }

  // 3. Legacy rounds
  const legacy = await coll.countDocuments({ routeSnapshot: { $exists: false } });
  logger.info(`[migrate-rounds-voyages] ${legacy} round(s) have no routeSnapshot (legacy: they read the live Service route)`);
  return { ok: true, duplicates: 0, legacy };
};

if (require.main === module) {
  (async () => {
    await connectDB();
    const res = await run({ dry: process.argv.includes('--dry') });
    await mongoose.disconnect();
    process.exit(res.ok ? 0 : 1);
  })().catch((e) => { logger.error(e.message); process.exit(1); });
}

module.exports = { run };
