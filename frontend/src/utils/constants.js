// Shared constants mirroring backend — used for dropdowns and display
export const VESSEL_STATUS       = ['Active', 'Inactive', 'Under Maintenance', 'Sold'];
export const OWNERSHIP_TYPES     = ['Owned', 'Chartered', 'Leased'];
export const AGENT_STATUS        = ['Active', 'Inactive'];
export const CONTAINER_SIZES     = ['20ft', '40ft', '40HC', '45ft'];
export const CONTAINER_TYPES_LIST = ['Dry', 'Reefer', 'Open Top', 'Flat Rack', 'Tank'];
export const EXPENSE_CATEGORIES  = ['Port Expense', 'Operating Expense', 'Other'];
export const SERVICE_STATUS      = ['Active', 'Inactive'];
export const ROUND_STATUS        = ['Planned', 'Active', 'Completed', 'Cancelled'];
export const VOYAGE_STATUS       = ['Scheduled', 'Departed', 'In Transit', 'Arrived', 'Completed', 'Cancelled'];
export const BOOKING_STATUS      = ['Pending', 'Confirmed', 'Final Loading', 'Cancelled'];
export const INVOICE_STATUS      = ['Draft', 'Issued', 'Paid', 'Overdue', 'Cancelled'];
export const TRACKING_STATUS     = ['At Port', 'Departed', 'In Transit', 'Arrived', 'Anchored', 'Delayed'];
export const USER_STATUS         = ['Active', 'Inactive'];
export const DEFAULT_PAGE_SIZE   = 20;

export const MODULES = [
  'users', 'roles', 'vessels', 'agents', 'locations',
  'containerTypes', 'expenseTypes', 'services', 'routes',
  'rounds', 'voyages', 'bookings', 'expenses', 'invoices',
  'tracking', 'reports', 'export', 'dashboard', 'auditLogs',
];
