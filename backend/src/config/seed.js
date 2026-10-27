'use strict';

/**
 * seed.js — bootstrap data for a fresh database.
 * Run manually: npm run seed (never auto-runs from the server).
 *
 * Seeds: roles, permissions, admin + demo users (passwords ALWAYS re-synced
 * from .env / demo defaults), and the V2 chart of accounts. It does NOT seed
 * operational demo data (vessels, rounds, bookings, ...); add that through the
 * app or a separate fixture script.
 *
 * Idempotent: safe to re-run.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('./db');
const logger = require('../utils/logger');
const { MODULES } = require('./constants');
const Role = require('../modules/roles/role.model');
const Permission = require('../modules/permissions/permission.model');
const User = require('../modules/users/user.model');
const { seedAccounts } = require('../modules/ledger/accounts.seed');
const lockDashboardAndAuditLogs = require('./migrations/migrate-dashboard-auditlogs');

const ALL = {
  create: true, read: true, update: true, delete: true, import: true, export: true, view: true,
  override: true, issue: true, cancel: true, record: true, approve: true, offset: true,
  commission: true, close: true, closeOverride: true, reopen: true, carryForward: true,
  useReserve: true, manage: true,
};
const READ = { read: true, view: true };
const CRUD = { create: true, read: true, update: true, delete: true, view: true };

// role name -> { module: actions }. Modules not listed get no access.
const ROLE_DEFS = [
  { name: 'SuperAdmin', description: 'Full system access', isSystem: true, grants: () => Object.fromEntries(MODULES.map((m) => [m, ALL])) },
  {
    name: 'Operations Manager',
    description: 'Rounds, voyages, bookings, tracking, services',
    grants: () => ({
      vessels: READ, agents: READ, customers: CRUD, locations: READ, containerTypes: READ, routes: READ, invoiceServices: READ,
      services: CRUD,
      rounds: CRUD, voyages: CRUD,
      bookings: { ...CRUD, import: true, export: true },
      tracking: CRUD,
      expenses: READ, invoices: READ, reports: { ...READ, export: true },
    }),
  },
  {
    name: 'Finance Officer',
    description: 'Expenses, invoices, reports, export',
    grants: () => ({
      agents: READ, customers: READ, vessels: READ, rounds: READ, voyages: READ, bookings: READ,
      invoiceServices: CRUD, accounting: CRUD,
      expenses: { ...CRUD, approve: true },
      invoices: { ...CRUD, issue: true, cancel: true, record: true },
      reports: { ...READ, export: true },
      export: { ...READ, export: true },
    }),
  },
  {
    name: 'Tracking Officer',
    description: 'Container and voyage tracking only',
    grants: () => ({ tracking: CRUD, voyages: READ }),
  },
  {
    name: 'Viewer',
    description: 'Read-only access',
    grants: () => Object.fromEntries(
      MODULES.filter((m) => !['users', 'roles', 'ledger', 'accounting', 'partners', 'dashboard', 'auditLogs'].includes(m))
        .map((m) => [m, READ])),
  },
];

const seedRolesAndPermissions = async () => {
  const roles = {};
  for (const def of ROLE_DEFS) {
    const role = await Role.findOneAndUpdate(
      { name: def.name },
      { $set: { description: def.description, isSystem: !!def.isSystem } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    roles[def.name] = role;
    const grants = def.grants();
    const ops = MODULES.map((module) => ({
      updateOne: {
        filter: { roleId: role._id, module },
        // $set only the granted actions so a re-run never revokes a toggle an admin added afterwards
        update: { $setOnInsert: { roleId: role._id, module, actions: grants[module] || {} } },
        upsert: true,
      },
    }));
    await Permission.bulkWrite(ops);
    logger.info(`[Seed] Role ready: ${def.name}`);
  }
  // dashboard + auditLogs stay hidden for every non-system role
  await lockDashboardAndAuditLogs();
  return roles;
};

const upsertUser = async ({ name, email, password, roleId }) => {
  const hash = await bcrypt.hash(password, 12);
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (!existing) {
    await User.create({ name, email, password: hash, roleId, status: 'Active', isInvited: false });
    logger.info(`[Seed] User created: ${email}`);
    return;
  }
  // Always re-sync password and role (intentional, keeps DB in step with .env)
  existing.password = hash;
  existing.roleId = roleId;
  existing.status = 'Active';
  existing.tokenVersion = (existing.tokenVersion || 0) + 1; // revoke sessions issued with the old password
  await existing.save();
  logger.info(`[Seed] User updated: ${email}`);
};

const seed = async () => {
  const roles = await seedRolesAndPermissions();

  await upsertUser({
    name: 'System Admin',
    email: process.env.ADMIN_EMAIL || 'admin@logistics.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123456',
    roleId: roles.SuperAdmin._id,
  });

  const demo = [
    { name: 'Omar Al-Rashidi', email: 'ops@logistics.com', role: 'Operations Manager' },
    { name: 'Sara Al-Zahrawi', email: 'finance@logistics.com', role: 'Finance Officer' },
    { name: 'Khalid Hassan', email: 'tracking@logistics.com', role: 'Tracking Officer' },
    { name: 'Layla Viewer', email: 'viewer@logistics.com', role: 'Viewer' },
  ];
  for (const u of demo) {
    await upsertUser({ name: u.name, email: u.email, password: 'Demo@123456', roleId: roles[u.role]._id });
  }

  const accounts = await seedAccounts();
  logger.info(`[Seed] Chart of accounts: inserted ${accounts.inserted} of ${accounts.total}`);
};

if (require.main === module) {
  connectDB()
    .then(seed)
    .then(() => { logger.info('[Seed] Done'); process.exit(0); })
    .catch((e) => { logger.error(`[Seed] Failed: ${e.message}`); process.exit(1); });
}

module.exports = { seed };
