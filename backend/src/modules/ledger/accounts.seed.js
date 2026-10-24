'use strict';

const Account = require('./account.model');

// Sprint050 P1 / D8-A — 4-digit chart of accounts, ONE Partner Current Account
// (1200) distinguished by partnerId on the journal line. Proposed list: the
// controller should confirm it before the ledger goes live.
const DEFAULT_ACCOUNTS = [
  { code: '1010', name: 'Company Bank',               type: 'Asset' },
  { code: '1020', name: 'Cash',                       type: 'Asset' },
  { code: '1100', name: 'Agent Receivable',           type: 'Asset' },
  { code: '1110', name: 'Agent Advances',             type: 'Asset' },
  { code: '1200', name: 'Partner Current Account',    type: 'Asset' },
  { code: '1300', name: 'PDA Prepaid / Advance',      type: 'Asset' },
  { code: '2000', name: 'Agent Payable',              type: 'Liability' },
  { code: '2100', name: 'Accrued Expenses',           type: 'Liability' },
  { code: '2200', name: 'JV Reserve',                 type: 'Liability' },
  { code: '2300', name: 'Unapplied Receipts',         type: 'Liability' },
  { code: '3000', name: 'Retained / Partner Equity',  type: 'Equity' },
  { code: '4000', name: 'Freight Revenue',            type: 'Revenue' },
  { code: '4100', name: 'Other Revenue',              type: 'Revenue' },
  { code: '5000', name: 'Port Expenses',              type: 'Expense' },
  { code: '5100', name: 'Hire Expense',               type: 'Expense' },
  { code: '5200', name: 'Agency Fees',                type: 'Expense' },
  { code: '5300', name: 'Handling Fees',              type: 'Expense' },
  { code: '5400', name: 'Commission',                 type: 'Expense' },
  { code: '5900', name: 'Other Voyage Costs',         type: 'Expense' },
  { code: '5990', name: 'FX Gain / Loss',             type: 'Expense' },
];

/** Idempotent: inserts only the codes that do not exist yet; never edits existing rows. */
const seedAccounts = async () => {
  const existing = new Set((await Account.find({}, 'code').lean()).map((a) => a.code));
  const missing = DEFAULT_ACCOUNTS.filter((a) => !existing.has(a.code));
  if (missing.length) await Account.insertMany(missing.map((a) => ({ ...a, isSystem: true, isActive: true })));
  return { inserted: missing.length, total: DEFAULT_ACCOUNTS.length };
};

module.exports = { DEFAULT_ACCOUNTS, seedAccounts };
