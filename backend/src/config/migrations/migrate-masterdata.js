'use strict';

// Master-data sprint (2026-10-25) - idempotent backfills + an incompleteness report.
// Safe to re-run: every step only fills fields that are still empty. Run on a COPY first.
//   npm run migrate:masterdata            apply
//   npm run migrate:masterdata -- --dry   count only, write nothing
require('dotenv').config();
const connectDB = require('../db');
const logger = require('../../utils/logger');

const DRY = process.argv.includes('--dry');

// ── pure transforms (unit-tested) ────────────────────────────────────────────
/** Legacy single partner.contact -> contacts[0]; null when there is nothing to move. */
const contactFromLegacy = (legacy) => {
  if (!legacy || !(legacy.person || legacy.email || legacy.phone)) return null;
  return { name: legacy.person || legacy.email || 'Contact', title: null, email: legacy.email || null, phone: legacy.phone || null };
};

/** Default expense account code for an existing expense type, from its name/category (reviewable afterwards). */
const expenseAccountCodeFor = ({ name = '', category = '' }) => {
  const s = `${name} ${category}`.toLowerCase();
  if (/hire|charter/.test(s)) return '5100';
  if (/agency|agent/.test(s)) return '5200';
  if (/handling|stevedor|thc/.test(s)) return '5300';
  if (/commission/.test(s)) return '5400';
  if (/port|pilot|tow|canal|bunker/.test(s)) return '5000';
  return '5900';
};

const steps = [];

steps.push({
  name: 'partners: contact -> contacts[], address',
  run: async () => {
    const Partner = require('../../modules/partners/partner.model');
    const rows = await Partner.find({ $or: [{ contacts: { $size: 0 } }, { address: null }] });
    let n = 0;
    for (const p of rows) {
      let changed = false;
      if (!p.contacts.length) {
        const c = contactFromLegacy(p.contact);
        if (c) { p.contacts.push(c); changed = true; }
      }
      if (!p.address && p.contact?.address) { p.address = p.contact.address; changed = true; }
      if (changed) { n += 1; if (!DRY) await p.save(); }
    }
    return n;
  },
});

steps.push({
  name: 'vessels: Chartered/Leased -> Time Charter',
  run: async () => {
    const Vessel = require('../../modules/vessels/vessel.model');
    const filter = { ownershipType: { $in: ['Chartered', 'Leased'] } };
    const n = await Vessel.collection.countDocuments(filter); // raw collection: the new enum no longer lists the old values
    if (!DRY && n) await Vessel.collection.updateMany(filter, { $set: { ownershipType: 'Time Charter' } });
    return n;
  },
});

steps.push({
  name: 'containerTypes: teuFactor from size',
  run: async () => {
    const ContainerType = require('../../modules/containerTypes/containerType.model');
    const { teuFactorForSize } = require('../../utils/masterValidators');
    let n = 0;
    for (const ct of await ContainerType.find({})) {
      const want = teuFactorForSize(ct.size);
      if (ct.teuFactor !== want) { n += 1; if (!DRY) { ct.teuFactor = want; await ct.save(); } }
    }
    return n;
  },
});

steps.push({
  name: 'services: revenue account -> 4000, applicability',
  run: async () => {
    const Service = require('../../modules/services/service.model');
    const Account = require('../../modules/ledger/account.model');
    const rev = await Account.findOne({ code: '4000' }).lean();
    if (!rev) throw new Error('Account 4000 missing - run npm run migrate:seed-accounts first');
    const filter = { $or: [{ revenueAccountId: null }, { revenueAccountId: { $exists: false } }, { applicability: { $exists: false } }] };
    const n = await Service.collection.countDocuments(filter);
    if (!DRY && n) {
      await Service.collection.updateMany({ $or: [{ revenueAccountId: null }, { revenueAccountId: { $exists: false } }] }, { $set: { revenueAccountId: rev._id } });
      await Service.collection.updateMany({ applicability: { $exists: false } }, { $set: { applicability: 'SOC_ONLY' } });
      await Service.collection.updateMany({ isTaxable: { $exists: false } }, { $set: { isTaxable: false } });
    }
    return n;
  },
});

steps.push({
  name: 'expenseTypes: level (from existing expenses), expense account, requiresPda',
  run: async () => {
    const ExpenseType = require('../../modules/expenseTypes/expenseType.model');
    const Expense = require('../../modules/expenses/expense.model');
    const Account = require('../../modules/ledger/account.model');
    const { levelFromScopes } = require('../../modules/expenseTypes/expenseType.logic');
    const acct = Object.fromEntries((await Account.find({}).select('code').lean()).map((a) => [a.code, a._id]));
    const types = await ExpenseType.collection.find({ $or: [{ expenseAccountId: null }, { expenseAccountId: { $exists: false } }, { operationalLevel: { $exists: false } }] }).toArray();
    for (const ty of types) {
      const scopes = await Expense.aggregate([
        { $match: { expenseTypeId: ty._id } },
        { $group: { _id: { $cond: [{ $ne: ['$portId', null] }, 'Port', { $cond: [{ $ne: ['$voyageId', null] }, 'Voyage', 'Round'] }] }, n: { $sum: 1 } } },
      ]);
      const counts = Object.fromEntries(scopes.map((s) => [s._id, s.n]));
      const set = {};
      if (!ty.operationalLevel) set.operationalLevel = levelFromScopes(counts);
      if (!ty.expenseAccountId) set.expenseAccountId = acct[expenseAccountCodeFor(ty)] || null;
      if (ty.requiresPda === undefined) set.requiresPda = false;
      if (Object.keys(counts).length > 1) logger.info(`[masterdata] REVIEW expense type "${ty.name}" is used at several scopes ${JSON.stringify(counts)} -> ${set.operationalLevel || ty.operationalLevel}`);
      if (!DRY) await ExpenseType.collection.updateOne({ _id: ty._id }, { $set: set });
    }
    return types.length;
  },
});

steps.push({
  name: 'agent agreements: earnsBookingCommission = true where a commission rule exists',
  run: async () => {
    const A = require('../../modules/agreements/agentAgreement.model');
    const filter = { 'commission.rule': { $in: ['fixedPerContainer', 'fixedPerBooking', 'percentOfRate'] }, earnsBookingCommission: { $exists: false } };
    const n = await A.collection.countDocuments(filter);
    if (!DRY && n) await A.collection.updateMany(filter, { $set: { earnsBookingCommission: true } });
    if (!DRY) await A.collection.updateMany({ earnsBookingCommission: { $exists: false } }, { $set: { earnsBookingCommission: false } });
    return n;
  },
});

/** Read-only: vessels that fail the master-data required-field rules. */
const reports = [{
  name: 'ports without a UN/LOCODE or with a malformed one',
  run: async () => {
    const Port = require('../../modules/locations/port.model');
    const { isUnLocode } = require('../../utils/masterValidators');
    const rows = await Port.find({}).select('name code').lean();
    return rows.filter((p) => !p.code || !isUnLocode(p.code)).map((p) => ({ port: p.name, code: p.code || null }));
  },
}, {
  name: 'countries without a local currency',
  run: async () => {
    const Country = require('../../modules/locations/country.model');
    return (await Country.find({ localCurrency: null }).select('name code').lean()).map((c) => ({ country: c.name, code: c.code }));
  },
}, {
  name: 'vessels missing required master data',
  run: async () => {
    const Vessel = require('../../modules/vessels/vessel.model');
    const { missingRequired } = require('../../modules/vessels/vessel.logic');
    const rows = await Vessel.find({}).lean();
    return rows.map((v) => ({ vessel: v.vesselCode, missing: missingRequired(v) })).filter((r) => r.missing.length);
  },
}];

const run = async () => {
  for (const s of steps) {
    const n = await s.run();
    logger.info(`[masterdata] ${s.name}: ${n} ${DRY ? 'would change' : 'changed'}`);
  }
  for (const r of reports) {
    const rows = await r.run();
    logger.info(`[masterdata] REPORT ${r.name}: ${rows.length}`);
    rows.forEach((x) => logger.info(`   ${JSON.stringify(x)}`));
  }
};

if (require.main === module) {
  connectDB().then(run).then(() => process.exit(0)).catch((e) => { logger.error(e.stack || e.message); process.exit(1); });
}

module.exports = { contactFromLegacy, expenseAccountCodeFor, steps, reports };
