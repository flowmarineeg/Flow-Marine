'use strict';

// Pure helpers for the 6-digit chart of accounts (docs/accounting). Unit-tested.
const TYPE_MAP = { ASSET: 'Asset', LIABILITY: 'Liability', EQUITY: 'Equity', REVENUE: 'Revenue', EXPENSE: 'Expense' };

/** One JSON chart row -> Account fields (parentId is resolved by the caller from parent_code). */
const toAccountFields = (row) => ({
  code: String(row.code),
  name: row.name_en,
  nameAr: row.name_ar || null,
  type: TYPE_MAP[row.account_type],
  level: row.level ?? null,
  normalBalance: row.normal_balance || null,
  isGroup: !!row.is_group,
  isPosting: !!row.is_posting,
  subledgerType: row.subledger_type || 'NONE',
  allocationLevel: row.allocation_level || 'NONE',
  requiredDimensions: row.required_dimensions || [],
  defaultCurrency: row.default_currency || null,
  isSystemLocked: !!row.is_system_locked,
  isActive: row.is_active !== false,
});

/** Returns the problems that would make the chart unimportable (empty array = ok). */
const validateChart = (rows) => {
  const errs = [];
  const codes = new Set();
  for (const r of rows) {
    if (!/^\d{6}$/.test(String(r.code))) errs.push(`${r.code}: code must be 6 digits`);
    if (codes.has(r.code)) errs.push(`${r.code}: duplicate code`);
    codes.add(r.code);
    if (!TYPE_MAP[r.account_type]) errs.push(`${r.code}: unknown account_type ${r.account_type}`);
    if (r.is_group && r.is_posting) errs.push(`${r.code}: cannot be both group and posting`);
  }
  for (const r of rows) if (r.parent_code && !codes.has(r.parent_code)) errs.push(`${r.code}: parent ${r.parent_code} missing`);
  return errs;
};

module.exports = { TYPE_MAP, toAccountFields, validateChart };
