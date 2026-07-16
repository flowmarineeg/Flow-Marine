'use strict';

// ─── Vessel ───────────────────────────────────────────────────────────────────
const VESSEL_STATUS = ['Active', 'Inactive', 'Under Maintenance', 'Sold'];
const OWNERSHIP_TYPES = ['Owned', 'Chartered', 'Leased'];

// ─── Agent ────────────────────────────────────────────────────────────────────
const AGENT_STATUS = ['Active', 'Inactive'];

// ─── Container Type ───────────────────────────────────────────────────────────
const CONTAINER_SIZES = ['20ft', '40ft', '40HC', '45ft'];
const CONTAINER_TYPES = ['Dry', 'Reefer', 'Open Top', 'Flat Rack', 'Tank'];

// ─── Expense Type ─────────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = ['Port Expense', 'Operating Expense', 'Other'];

// ─── Service ──────────────────────────────────────────────────────────────────
const SERVICE_STATUS = ['Active', 'Inactive'];

// ─── Round ────────────────────────────────────────────────────────────────────
const ROUND_STATUS = ['Planned', 'Active', 'Completed', 'Cancelled'];

// ─── Voyage ───────────────────────────────────────────────────────────────────
const VOYAGE_STATUS = ['Scheduled', 'Departed', 'In Transit', 'Arrived', 'Completed', 'Cancelled'];

// ─── Booking ──────────────────────────────────────────────────────────────────
const BOOKING_STATUS = ['Pending', 'Confirmed', 'Final Loading', 'Cancelled'];

// ─── Invoice ──────────────────────────────────────────────────────────────────
const INVOICE_STATUS = ['Draft', 'Issued', 'Paid', 'Overdue', 'Cancelled'];

// ─── Tracking ─────────────────────────────────────────────────────────────────
const TRACKING_STATUS = ['At Port', 'Departed', 'In Transit', 'Arrived', 'Anchored', 'Delayed'];

// ─── User ─────────────────────────────────────────────────────────────────────
const USER_STATUS = ['Active', 'Inactive'];

// ─── Audit ────────────────────────────────────────────────────────────────────
const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'];

// ─── Modules (for RBAC) ───────────────────────────────────────────────────────
const MODULES = [
  'users',
  'roles',
  'vessels',
  'agents',
  'locations',
  'containerTypes',
  'expenseTypes',
  'services',
  'routes',
  'rounds',
  'voyages',
  'bookings',
  'expenses',
  'invoices',
  'tracking',
  'reports',
  'export',
  'dashboard',   // Sprint019 — RBAC audit
  'auditLogs',
];

// ─── Pagination ───────────────────────────────────────────────────────────────
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

module.exports = {
  VESSEL_STATUS,
  OWNERSHIP_TYPES,
  AGENT_STATUS,
  CONTAINER_SIZES,
  CONTAINER_TYPES,
  EXPENSE_CATEGORIES,
  SERVICE_STATUS,
  ROUND_STATUS,
  VOYAGE_STATUS,
  BOOKING_STATUS,
  INVOICE_STATUS,
  TRACKING_STATUS,
  USER_STATUS,
  AUDIT_ACTIONS,
  MODULES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
