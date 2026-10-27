'use strict';

// ─── Vessel ───────────────────────────────────────────────────────────────────
const VESSEL_STATUS = ['Active', 'Inactive', 'Under Maintenance', 'Sold'];
const SERVICE_APPLICABILITY = ['SOC_ONLY', 'COC_ONLY', 'BOTH'];
const OWNERSHIP_TYPES = ['Owned', 'Time Charter', 'Voyage Charter'];

// ─── Agent ────────────────────────────────────────────────────────────────────
const AGENT_STATUS = ['Active', 'Inactive'];

// ─── Container Type ───────────────────────────────────────────────────────────
const CONTAINER_SIZES = ['20ft', '40ft', '40HC', '45ft'];
const CONTAINER_TYPES = ['Dry', 'Reefer', 'Open Top', 'Flat Rack', 'Tank'];

// ─── Expense Type ─────────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = ['Port Expense', 'Operating Expense', 'Other'];

// Sprint 035 — business classification of an ExpenseCategory for the Voyage
// Profitability report. Configurable per category by the business (via the
// existing category management UI) — the report NEVER hardcodes a category
// name like 'Port Expense' to decide Voyage Cost vs Other Voyage Cost.
const EXPENSE_COST_CLASSIFICATIONS = ['Voyage Cost', 'Other Voyage Cost'];

// ─── Service ──────────────────────────────────────────────────────────────────
const SERVICE_STATUS = ['Active', 'Inactive'];

// ─── Round ────────────────────────────────────────────────────────────────────
const ROUND_STATUS = ['Planned', 'Active', 'Completed', 'Cancelled'];

// ─── Voyage ───────────────────────────────────────────────────────────────────
const VOYAGE_STATUS = ['Scheduled', 'Departed', 'In Transit', 'Arrived', 'Completed', 'Cancelled'];

// ─── Booking ──────────────────────────────────────────────────────────────────
const BOOKING_STATUS = ['Pending', 'Confirmed', 'Final Loading', 'Cancelled'];

// ─── Invoice ──────────────────────────────────────────────────────────────────
// Sprint 033: 'Partially Paid' added — invoice status is now derived from the
// sum of its Payments, never hand-set once payments exist (see invoice.service.js).
const INVOICE_STATUS = ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];
const INVOICE_TYPES  = ['Booking', 'Voyage', 'Round'];

// ─── Payment (Sprint 033) ─────────────────────────────────────────────────────
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'Other'];

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
  'customers',   // master data 11.3B
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
  'partners',    // Sprint050 V2
  'ledger',      // Sprint050 V2
  'accounting',  // master data 2026-10-27: Masters -> Accounting (chart of accounts)
  'invoiceServices', // master data 2026-10-27: invoice service master
];

// ─── Pagination ───────────────────────────────────────────────────────────────
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

module.exports = {
  VESSEL_STATUS,
  OWNERSHIP_TYPES,
  SERVICE_APPLICABILITY,
  AGENT_STATUS,
  CONTAINER_SIZES,
  CONTAINER_TYPES,
  EXPENSE_CATEGORIES,
  EXPENSE_COST_CLASSIFICATIONS,
  SERVICE_STATUS,
  ROUND_STATUS,
  VOYAGE_STATUS,
  BOOKING_STATUS,
  INVOICE_STATUS,
  INVOICE_TYPES,
  PAYMENT_METHODS,
  TRACKING_STATUS,
  USER_STATUS,
  AUDIT_ACTIONS,
  MODULES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
