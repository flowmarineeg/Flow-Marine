'use strict';

const AppError = require('../../utils/AppError');

const TOTAL_BP = 10000;

/**
 * Pure validation of a vessel's share table (no DB) — unit tested.
 * shares: [{ partnerId, shareBp, isLead }]
 */
const validateShares = (shares) => {
  if (!Array.isArray(shares) || shares.length === 0) {
    throw new AppError(400, 'At least one partner share is required', 'SHARES_NOT_100');
  }
  const seen = new Set();
  let total = 0;
  let leads = 0;
  for (const s of shares) {
    if (!s.partnerId) throw new AppError(400, 'Every share needs a partner', 'SHARE_PARTNER_REQUIRED');
    if (!Number.isInteger(s.shareBp) || s.shareBp < 1 || s.shareBp > TOTAL_BP) {
      throw new AppError(400, 'Share must be a whole number of basis points between 1 and 10000', 'SHARE_INVALID');
    }
    const key = String(s.partnerId);
    if (seen.has(key)) throw new AppError(400, 'A partner can appear only once per vessel', 'DUPLICATE_PARTNER');
    seen.add(key);
    total += s.shareBp;
    if (s.isLead) leads += 1;
  }
  if (total !== TOTAL_BP) {
    throw new AppError(400, `Shares must total 100% (currently ${(total / 100).toFixed(2)}%)`, 'SHARES_NOT_100');
  }
  if (leads !== 1) {
    throw new AppError(400, 'Exactly one partner must be the lead operator', 'LEAD_COUNT_INVALID');
  }
};

module.exports = { TOTAL_BP, validateShares };
