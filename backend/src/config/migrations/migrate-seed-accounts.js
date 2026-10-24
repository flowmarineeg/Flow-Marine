'use strict';

// Sprint050 — idempotent, non-destructive: inserts any missing chart-of-accounts
// rows. Safe to re-run. Run: npm run migrate:seed-accounts
require('dotenv').config();
const connectDB = require('../db');
const { seedAccounts } = require('../../modules/ledger/accounts.seed');
const logger = require('../../utils/logger');

if (require.main === module) {
  connectDB()
    .then(seedAccounts)
    .then((r) => { logger.info(`[seed-accounts] inserted ${r.inserted} of ${r.total}`); process.exit(0); })
    .catch((e) => { logger.error(e.message); process.exit(1); });
}

module.exports = { seedAccounts };
