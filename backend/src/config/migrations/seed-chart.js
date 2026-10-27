'use strict';

// Imports the 6-digit chart of accounts (docs/accounting). Idempotent. Run: npm run seed:chart [-- --dry]
require('dotenv').config();
const connectDB = require('../db');
const { seedChart } = require('../../modules/accounting/chart.seed');
const logger = require('../../utils/logger');

const DRY = process.argv.includes('--dry');
if (require.main === module) {
  connectDB()
    .then(() => seedChart({ dry: DRY }))
    .then((r) => { logger.info(`[seed-chart]${DRY ? ' DRY' : ''} inserted ${r.inserted}, refreshed ${r.updated}, file has ${r.total}`); process.exit(0); })
    .catch((e) => { logger.error(e.message); process.exit(1); });
}
