'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const connectDB = require('./config/db');
const { validate: validateEnv } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

validateEnv();

const app = express();

// ─── Security + compression ───────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());   // Sprint020 PERF-010: gzip all JSON responses
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  credentials: true,
  exposedHeaders: ['X-CSRF-Token'],
}));

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(require('./middleware/csrf').csrfProtection); // Sprint049 C1

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/v1/health', (_req, res) =>
  res.json({ success: true, message: 'API is running', timestamp: new Date().toISOString() })
);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', require('./modules/auth/auth.routes'));
app.use('/api/v1/users', require('./modules/users/user.routes'));
app.use('/api/v1/roles', require('./modules/roles/role.routes'));
app.use('/api/v1/permissions', require('./modules/permissions/permission.routes'));
app.use('/api/v1/audit-logs', require('./modules/auditLogs/auditLog.routes'));
app.use('/api/v1/vessels', require('./modules/vessels/vessel.routes'));
app.use('/api/v1/agents', require('./modules/agents/agent.routes'));
app.use('/api/v1/customers', require('./modules/customers/customer.routes'));
app.use('/api/v1/container-types', require('./modules/containerTypes/containerType.routes'));
app.use('/api/v1/expense-types', require('./modules/expenseTypes/expenseType.routes'));
app.use('/api/v1/export', require('./modules/export/export.routes'));
app.use('/api/v1/locations', require('./modules/locations/location.routes'));
app.use('/api/v1/services', require('./modules/services/service.routes'));
app.use('/api/v1/invoice-services', require('./modules/invoiceServices/invoiceService.routes')); // master data 2026-10-27
app.use('/api/v1/rounds', require('./modules/rounds/round.routes'));
app.use('/api/v1/voyages', require('./modules/voyages/voyage.routes'));
app.use('/api/v1/bookings', require('./modules/bookings/booking.routes'));
app.use('/api/v1/expenses', require('./modules/expenses/expense.routes'));
app.use('/api/v1/invoices', require('./modules/billing/billing.routes')); // V2 invoices (the only invoicing)
app.use('/api/v1/tracking', require('./modules/tracking/tracking.routes'));
app.use('/api/v1/reports', require('./modules/reports/reports.routes'));
app.use('/api/v1/dashboard', require('./modules/dashboard/dashboard.routes'));
app.use('/api/v1/capacity', require('./modules/capacity/capacity.routes'));
app.use('/api/v1/partners', require('./modules/partners/partner.routes'));   // Sprint050 V2
app.use('/api/v1/ledger', require('./modules/ledger/ledger.routes'));       // Sprint050 V2
app.use('/api/v1/accounting', require('./modules/accounting/accounting.routes')); // master data 2026-10-27
app.use('/api/v1/agent-accounts', require('./modules/agentAccounts/agentAccounts.routes')); // Sprint052 V2
app.use('/api/v1/round-accounting', require('./modules/partnerSettlement/partnerSettlement.routes')); // Sprint053 V2

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.originalUrl}` })
);

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Startup ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
let server;

(async () => {
  try {
    await connectDB();
    server = app.listen(PORT, () =>
      logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`)
    );
  } catch (err) {
    logger.error(`[Startup] Failed to start server: ${err.message}`);
    process.exit(1);
  }
})();

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`[Shutdown] ${signal} received — shutting down gracefully`);
  if (server) {
    server.close(async () => {
      try {
        const mongoose = require('mongoose');
        await mongoose.disconnect();
        logger.info('[Shutdown] MongoDB disconnected');
      } catch (_) { }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
