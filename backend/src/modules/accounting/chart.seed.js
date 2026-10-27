'use strict';

const Account = require('../ledger/account.model');
const chart = require('../ledger/chart.6digit.json');
const { toAccountFields, validateChart } = require('./chart.logic');

/**
 * Idempotent import of the 6-digit chart (docs/accounting). Upserts by code, parents linked by parent_code.
 * Never touches the legacy 4-digit posting accounts. Master data only - the ledger still posts to the 4-digit codes.
 */
const seedChart = async ({ dry = false } = {}) => {
  const errs = validateChart(chart);
  if (errs.length) throw new Error(`Chart file invalid: ${errs.slice(0, 5).join('; ')}`);
  let inserted = 0; let updated = 0;
  const idByCode = new Map();
  for (const row of chart) { // file is ordered parent-first
    const f = toAccountFields(row);
    const parentId = row.parent_code ? idByCode.get(row.parent_code) || null : null;
    const existing = await Account.findOne({ code: f.code });
    if (existing) {
      idByCode.set(f.code, existing._id);
      if (existing.isSystemLocked || !existing.level) { // refresh only imported rows; never overwrite admin edits on unlocked rows
        if (!dry) await Account.updateOne({ _id: existing._id }, { $set: { ...f, parentId, isSystem: f.isSystemLocked } });
        updated += 1;
      }
    } else if (dry) {
      inserted += 1;
    } else {
      const doc = await Account.create({ ...f, parentId, isSystem: f.isSystemLocked });
      idByCode.set(f.code, doc._id);
      inserted += 1;
    }
  }
  return { inserted, updated, total: chart.length };
};

module.exports = { seedChart };
