'use strict';

// Which chart-of-accounts accounts a master-data field may point at (master data 11.6 / 11.7).
// The spec names account groups 400000 / 500000 / 213000; our chart is 4-digit, so groups are matched by
// account type + code prefix instead of renumbering the chart.
const AppError = require('../../utils/AppError');

const RULES = {
  revenue: { type: 'Revenue', prefix: '4', label: 'a revenue account (4xxx)' },
  expense: { type: 'Expense', prefix: '5', label: 'an expense account (5xxx)' },
  accrual: { type: 'Liability', prefix: '21', label: 'an accrual account (21xx)' },
  receivable: { type: 'Asset', prefix: '11', label: 'a receivable account (11xx)' },
};

/** Pure: does this account satisfy the rule? */
const accountMatches = (account, rule) => {
  const r = RULES[rule];
  return !!(r && account && account.isActive !== false && !account.isGroup && account.isPosting !== false && account.type === r.type && String(account.code || '').startsWith(r.prefix));
};

/** Loads the account and throws 400 unless it satisfies the rule. Returns the lean account. */
const assertAccountFor = async (accountId, rule, fieldLabel) => {
  const Account = require('./account.model');
  const acc = await Account.findById(accountId).lean();
  if (!acc) throw new AppError(400, `${fieldLabel}: account not found`, 'ACCOUNT_NOT_FOUND');
  if (!accountMatches(acc, rule)) throw new AppError(400, `${fieldLabel} must be ${RULES[rule].label}`, 'ACCOUNT_WRONG_GROUP');
  return acc;
};

module.exports = { RULES, accountMatches, assertAccountFor };
