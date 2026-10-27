'use strict';

/**
 * seed-test-data.js — a full, realistic TEST dataset for the whole system.
 *
 *   npm run seed:test-data            add the dataset (skips operational data if it is already there)
 *   npm run seed:test-data -- --reset DROP the database first (local databases only), then seed everything
 *
 * What it creates (all money goes through the real services, so the ledger, invoices,
 * settlements and partner accounts are consistent and the trial balance balances):
 *   master data   countries, cities, ports, terminals, container types, expense categories/types,
 *                 agents (incl. a Direct Line), services + routes, vessels, partners + JV shares, agreements
 *   Round A       Completed + CLOSED: Final Loading bookings, PDA->FDA expenses (all paid-by kinds),
 *                 invoices (paid / partly paid), partner receipts, handling fees, netting, partner
 *                 settlement, transfers (some paid), JV reserve carry-forward
 *   Round B       ACTIVE: every booking status, Layer 1 manual bookings, discharged/remaining containers,
 *                 invoices in every state (Draft / Issued / Partially Paid / Overdue / Paid + credit note),
 *                 open PDA estimate, tracking history
 *   Round C       PLANNED: manual bookings only
 *
 * Safety: refuses an Atlas/remote URI unless SEED_ALLOW_REMOTE=yes; --reset only on localhost.
 * Needs a MongoDB REPLICA SET (V2 uses transactions). URI comes from SEED_MONGODB_URI, else MONGODB_URI.
 * Logins are the usual seed users (see seed.js).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { toMinor } = require('../utils/money');

const URI = process.env.SEED_MONGODB_URI || process.env.MONGODB_URI;
const RESET = process.argv.includes('--reset');
const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysAhead = (n) => new Date(Date.now() + n * DAY);
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const M = (n) => toMinor(n, 'USD');

// ─── console reporting ───────────────────────────────────────────────────────
const results = [];
const step = async (name, fn) => {
  try {
    const out = await fn();
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
    return out;
  } catch (e) {
    const msg = e && (e.message || JSON.stringify(e));
    results.push({ name, ok: false, error: `${e && e.code ? `[${e.code}] ` : ''}${msg}` });
    console.log(`  FAIL  ${name}\n        ${e && e.code ? `[${e.code}] ` : ''}${msg}`);
    return null;
  }
};

const assertSafeTarget = () => {
  if (!URI) throw new Error('No MongoDB URI: set SEED_MONGODB_URI or MONGODB_URI');
  const remote = /mongodb\+srv|mongodb\.net/i.test(URI);
  const local = /^mongodb:\/\/(localhost|127\.0\.0\.1)/i.test(URI);
  if (remote && process.env.SEED_ALLOW_REMOTE !== 'yes') {
    throw new Error('Refusing to seed a remote/Atlas database. Point SEED_MONGODB_URI at a local replica set, or set SEED_ALLOW_REMOTE=yes if you really mean it.');
  }
  if (RESET && !local && process.env.SEED_ALLOW_REMOTE !== 'yes') throw new Error('--reset on a non-localhost database needs SEED_ALLOW_REMOTE=yes');
};

// ─── lazily loaded modules ───────────────────────────────────────────────────
let m;
const load = () => {
  const r = (p) => require(`../modules/${p}`);
  m = {
    Country: r('locations/country.model'), City: r('locations/city.model'), Port: r('locations/port.model'), Terminal: r('locations/terminal.model'),
    ContainerType: r('containerTypes/containerType.model'), Account: r('ledger/account.model'),
    ExpenseCategory: r('expenseTypes/expenseCategory.model'), ExpenseType: r('expenseTypes/expenseType.model'),
    Agent: r('agents/agent.model'), AgentAgreement: r('agreements/agentAgreement.model'),
    Service: r('services/service.model'), Route: r('routes/route.model'), Vessel: r('vessels/vessel.model'),
    Partner: r('partners/partner.model'), VesselPartner: r('partners/vesselPartner.model'),
    Round: r('rounds/round.model'), Voyage: r('voyages/voyage.model'),
    Booking: r('bookings/booking.model'), ManualBooking: r('bookings/manualBooking.model'),
    Expense: r('expenses/expense.model'), Invoice: r('invoices/invoice.model'),
    User: r('users/user.model'),
    routeSvc: r('routes/route.service'), roundSvc: r('rounds/round.service'), voyageSvc: r('voyages/voyage.service'),
    bookingSvc: r('bookings/booking.service'), manualSvc: r('bookings/manualBooking.service'),
    trackingSvc: r('tracking/tracking.service'), expenseSvc: r('expenses/expense.service'), expV2: r('expenses/expenseV2.service'),
    partnerSvc: r('partners/partner.service'), items: r('billing/bookingItem.service'), billing: r('billing/invoiceV2.service'),
    agentAcc: r('agentAccounts/agentAccounts.service'),
    ps: r('partnerSettlement/partnerSettlement.service'), rc: r('partnerSettlement/roundClose.service'),
    ledger: r('ledger/ledger.service'),
  };
  // make sure models that are only reached through populate()/refs are registered
  ['agentAccounts/agentAccounts.models', 'billing/billing.models', 'partnerSettlement/partnerSettlement.models', 'roles/role.model'].forEach(r);
};

// ─── master data ─────────────────────────────────────────────────────────────
const upsert = (Model, filter, doc) => Model.findOneAndUpdate(filter, { $setOnInsert: doc }, { upsert: true, new: true, setDefaultsOnInsert: true });

const seedMasterData = async (uid) => {
  const W = {};

  W.countries = {};
  for (const [name, code] of [['China', 'CN'], ['Singapore', 'SG'], ['United Arab Emirates', 'AE'], ['Saudi Arabia', 'SA'], ['Egypt', 'EG']]) {
    W.countries[code] = await upsert(m.Country, { code }, { name, code, createdBy: uid });
  }
  const PORTS = [
    { key: 'SHA', country: 'CN', city: 'Shanghai', port: 'Shanghai', code: 'CNSHA', terminal: 'Yangshan Deep Water' },
    { key: 'SIN', country: 'SG', city: 'Singapore', port: 'Singapore', code: 'SGSIN', terminal: 'Tuas Terminal' },
    { key: 'JEA', country: 'AE', city: 'Dubai', port: 'Jebel Ali', code: 'AEJEA', terminal: 'DP World Jebel Ali' },
    { key: 'JED', country: 'SA', city: 'Jeddah', port: 'Jeddah Islamic Port', code: 'SAJED', terminal: 'South Container Terminal' },
    { key: 'PSD', country: 'EG', city: 'Port Said', port: 'Port Said East', code: 'EGPSD', terminal: 'SCCT' },
  ];
  W.port = {}; W.city = {}; W.terminal = {};
  for (const p of PORTS) {
    const country = W.countries[p.country];
    const city = await upsert(m.City, { name: p.city, countryId: country._id }, { name: p.city, countryId: country._id, createdBy: uid });
    const port = await upsert(m.Port, { name: p.port, cityId: city._id }, { name: p.port, code: p.code, cityId: city._id, countryId: country._id, createdBy: uid });
    const terminal = await upsert(m.Terminal, { name: p.terminal, portId: port._id }, { name: p.terminal, portId: port._id, createdBy: uid });
    W.city[p.key] = city; W.port[p.key] = port; W.terminal[p.key] = terminal;
  }

  W.ct = {};
  for (const [code, size, type, description] of [
    ['20DRY', '20ft', 'Dry', "20' General purpose"], ['40DRY', '40ft', 'Dry', "40' General purpose"],
    ['40HC', '40HC', 'Dry', "40' High cube"], ['20RF', '20ft', 'Reefer', "20' Reefer"],
    ['40HCRF', '40HC', 'Reefer', "40' High cube reefer"], ['20OT', '20ft', 'Open Top', "20' Open top"],
  ]) {
    const isoCode = { '20DRY': '22G1', '40DRY': '42G1', '40HC': '45G1', '20RF': '22R1', '40HCRF': '45R1', '20OT': '22U1' }[code];
    W.ct[code] = await upsert(m.ContainerType, { code }, { code, isoCode, size, type, description, teuFactor: require('../utils/masterValidators').teuFactorForSize(size), createdBy: uid });
  }

  // Port Expense -> "Voyage Cost"; everything else -> "Other Voyage Cost" (reports read this flag, never a name)
  for (const [name, costClassification] of [['Port Expense', 'Voyage Cost'], ['Hire', 'Other Voyage Cost'], ['Agency', 'Other Voyage Cost'], ['Canal', 'Other Voyage Cost'], ['Operations', 'Other Voyage Cost']]) {
    await upsert(m.ExpenseCategory, { name }, { name, costClassification, createdBy: uid });
  }
  const acct = {};
  for (const a of await m.Account.find({}).select('code').lean()) acct[a.code] = a._id;
  W.et = {};
  // [name, category, operationalLevel, expense account, requiresPda]
  for (const [name, category, operationalLevel, code, requiresPda] of [
    ['Port Dues', 'Port Expense', 'PORT_LEVEL', '5000', true], ['Terminal Handling', 'Port Expense', 'PORT_LEVEL', '5000', true],
    ['Pilotage & Towage', 'Port Expense', 'PORT_LEVEL', '5000', false],
    ['Hire Rate', 'Hire', 'ROUND_LEVEL', '5100', false], ['Agency Fees', 'Agency', 'ROUND_LEVEL', '5200', false],
    ['Canal Dues', 'Canal', 'ROUND_LEVEL', '5000', false], ['Stevedoring', 'Operations', 'PORT_LEVEL', '5300', false],
    ['Miscellaneous', 'Operations', 'VOYAGE_LEVEL', '5900', false],
  ]) {
    W.et[name] = await upsert(m.ExpenseType, { name }, {
      name, category, operationalLevel, requiresPda, expenseAccountId: acct[code], accrualAccountId: requiresPda ? acct['2100'] : null, createdBy: uid,
    });
  }

  W.agent = {};
  const AGENTS = [
    { code: 'SHA-AG', name: 'Shanghai Maritime Agency', country: 'China', city: 'Shanghai', port: 'Shanghai', creditDays: 30, roles: ['Commercial'], contact: ['Li Wei', '+86 21 5555 0101', 'li.wei@shamaritime.test'] },
    { code: 'SIN-AG', name: 'Lion City Shipping Agency', country: 'Singapore', city: 'Singapore', port: 'Singapore', creditDays: 30, roles: ['Commercial', 'Port'], contact: ['Tan Mei Ling', '+65 6555 0102', 'tan@lioncity.test'] },
    { code: 'DXB-AG', name: 'Gulf Gateway Agency', country: 'United Arab Emirates', city: 'Dubai', port: 'Jebel Ali', creditDays: 45, roles: ['Commercial', 'Port'], contact: ['Ahmed Al Mansoori', '+971 4 555 0103', 'ahmed@gulfgateway.test'] },
    { code: 'JED-AG', name: 'Red Sea Agencies', country: 'Saudi Arabia', city: 'Jeddah', port: 'Jeddah Islamic Port', creditDays: 30, roles: ['Commercial', 'Port'], contact: ['Fahad Al Harbi', '+966 12 555 0104', 'fahad@redsea.test'] },
    { code: 'PSD-AG', name: 'Suez Canal Agency', country: 'Egypt', city: 'Port Said', port: 'Port Said East', creditDays: 60, roles: ['Commercial', 'Port'], contact: ['Mona Fathy', '+20 66 555 0105', 'mona@suezagency.test'] },
    { code: 'DL-ONE', name: 'Oceanic Direct Line', country: 'United Arab Emirates', city: 'Dubai', port: null, creditDays: 15, roles: ['Commercial'], partyType: 'DirectLine', contact: ['Rashid Karim', '+971 4 555 0106', 'rashid@oceanicdirect.test'] },
  ];
  for (const a of AGENTS) {
    W.agent[a.code] = await upsert(m.Agent, { agentCode: a.code }, {
      agentCode: a.code, agentName: a.name, country: a.country, city: a.city, port: a.port, address: `${a.city}, ${a.country}`,
      contacts: [{ contactPerson: a.contact[0], mobile: a.contact[1], email: a.contact[2], description: 'Main contact' }],
      roles: a.roles, creditDays: a.creditDays, partyType: a.partyType || 'Agent', createdBy: uid,
    });
  }

  W.partner = {};
  for (const [code, name, person] of [['ALFA', 'Alfa Shipping Holdings', 'Hassan Alfa'], ['BETA', 'Beta Marine Investments', 'Nadia Beta'], ['GAMMA', 'Gamma Ocean Partners', 'Omar Gamma']]) {
    W.partner[code] = await upsert(m.Partner, { code }, { code, name, contact: { person, email: `${code.toLowerCase()}@partners.test`, phone: '+971 4 555 0200' }, createdBy: uid });
  }

  W.vessel = {};
  const VESSELS = [
    { code: 'ALNOOR', name: 'MV Al Noor', imo: '9811001', ownership: 'Owned', owner: 'Alfa Shipping Holdings', cap: 4500, dwt: 52000, built: 2012, flag: 'Panama' },
    { code: 'RSTAR', name: 'MV Red Sea Star', imo: '9811002', ownership: 'Time Charter', owner: 'Blue Horizon Ltd', cap: 3200, dwt: 38000, built: 2015, flag: 'Marshall Islands', charter: [daysAgo(400), daysAhead(330)] },
    { code: 'GPION', name: 'MV Gulf Pioneer', imo: '9811003', ownership: 'Voyage Charter', owner: 'Gulf Leasing Co', cap: 2800, dwt: 30000, built: 2009, flag: 'Liberia', charter: [daysAgo(200), daysAhead(20)] },
  ];
  for (const v of VESSELS) {
    W.vessel[v.code] = await upsert(m.Vessel, { vesselCode: v.code }, {
      vesselCode: v.code, vesselName: v.name, imoNumber: v.imo, flag: v.flag, callSign: `${v.code.slice(0, 4)}9`, ownershipType: v.ownership,
      ownerName: v.owner, capacity: v.cap, dwt: v.dwt, builtYear: v.built, manager: 'Flow Marine Ship Management',
      loa: 210, beam: 32, summerDraft: 11.5, grossTonnage: 34000, netTonnage: 17000, suezGT: 35000, suezNT: 28000,
      totalBunkerCapacity: 3800, vlsfoCapacity: 3200, mdoCapacity: 400, fwCapacity: 250,
      defaultDailyHireRateMinor: 1200000, reeferPlugs: 120, mainEngineFuelType: 'VLSFO', auxEngineFuelType: 'LSMGO',
      consumptionSeaMtDay: 38, consumptionPortIdleMtDay: 6, consumptionPortWorkingMtDay: 9,
      charterStartDate: v.charter ? v.charter[0] : null, charterEndDate: v.charter ? v.charter[1] : null, createdBy: uid,
    });
  }

  W.service = {};
  W.service.ASME = await upsert(m.Service, { serviceCode: 'ASME' }, { serviceCode: 'ASME', serviceName: 'Asia - Middle East Express', defaultVesselId: W.vessel.ALNOOR._id, description: 'Shanghai - Singapore - Jebel Ali - Jeddah', applicability: 'SOC_ONLY', isTaxable: false, revenueAccountId: acct['4000'], createdBy: uid });
  W.service.GMED = await upsert(m.Service, { serviceCode: 'GMED' }, { serviceCode: 'GMED', serviceName: 'Gulf - Med Shuttle', defaultVesselId: W.vessel.RSTAR._id, description: 'Jebel Ali - Jeddah - Port Said', applicability: 'SOC_ONLY', isTaxable: false, revenueAccountId: acct['4000'], createdBy: uid });
  const leg = (key, agentCode) => ({ countryId: W.port[key].countryId, cityId: W.city[key]._id, portId: W.port[key]._id, terminalId: W.terminal[key]._id, agentId: agentCode ? W.agent[agentCode]._id : null });
  const ROUTES = {
    ASME: [leg('SHA', 'SHA-AG'), leg('SIN', 'SIN-AG'), leg('JEA', 'DXB-AG'), leg('JED', 'JED-AG')],
    GMED: [leg('JEA', 'DXB-AG'), leg('JED', 'JED-AG'), leg('PSD', 'PSD-AG')],
  };
  for (const [code, legs] of Object.entries(ROUTES)) {
    if (!(await m.Route.exists({ serviceId: W.service[code]._id }))) await m.routeSvc.saveLegs(W.service[code]._id, legs, uid);
  }

  return W;
};

const seedPartnersAndAgreements = async (W, uid) => {
  const sh = (code, bp) => ({ partnerId: W.partner[code]._id, shareBp: bp });
  const SHARES = {
    ALNOOR: [sh('ALFA', 5000), sh('BETA', 3000), sh('GAMMA', 2000)],
    RSTAR: [sh('ALFA', 6000), sh('BETA', 4000)],
    GPION: [sh('BETA', 5000), sh('GAMMA', 5000)],
  };
  for (const [code, shares] of Object.entries(SHARES)) {
    if (!(await m.VesselPartner.exists({ vesselId: W.vessel[code]._id }))) await m.partnerSvc.setShares(W.vessel[code]._id, shares, uid);
  }
  const fees = (full, empty) => [
    { moveType: 'Load', containerStatus: 'Full', amountMinor: M(full) }, { moveType: 'Load', containerStatus: 'Empty', amountMinor: M(empty) },
    { moveType: 'Discharge', containerStatus: 'Full', amountMinor: M(full - 5) }, { moveType: 'Discharge', containerStatus: 'Empty', amountMinor: M(empty - 5) },
  ];
  const AGREEMENTS = [
    ['SIN-AG', { handlingFees: fees(60, 35), commission: { rule: 'fixedPerContainer', amountMinor: M(5) } }],
    ['DXB-AG', { handlingFees: fees(70, 40), commission: { rule: 'percentOfRate', percentBp: 200, basis: 'Invoice' } }],
    ['JED-AG', { handlingFees: fees(65, 38), commission: { rule: 'fixedPerBooking', amountMinor: M(20) } }],
  ];
  for (const [code, a] of AGREEMENTS) {
    if (!(await m.AgentAgreement.exists({ agentId: W.agent[code]._id }))) {
      await m.agentAcc.saveAgreement(W.agent[code]._id, null, { currency: 'USD', validFrom: daysAgo(365), ...a }, uid);
    }
  }
};

// ─── operational data helpers ────────────────────────────────────────────────
let boxSeq = 0;
const BOX_PREFIX = ['MSCU', 'MAEU', 'CMAU', 'HLCU', 'TGHU', 'OOLU'];
const boxNo = () => { boxSeq += 1; return `${BOX_PREFIX[boxSeq % BOX_PREFIX.length]}${String(1000000 + boxSeq * 7).slice(0, 7)}`; };
const SHIPPERS = ['Shenzhen Electronics Co', 'Ningbo Textile Group', 'Jurong Industrial Supplies', 'Al Futtaim Trading', 'Saudi Steel Imports', 'Delta Foods Egypt'];
const COMMODITIES = ['Electronics', 'Garments', 'Machinery parts', 'Building materials', 'Frozen food', 'Furniture', 'Plastic resin'];

/** Create N bookings through the real service. mix = [[ctCode, rate, count], ...] */
const makeBookings = async (W, voyage, agentCode, mix, status, uid, extra = {}) => {
  const out = [];
  let i = 0;
  for (const [ctCode, rate, count] of mix) {
    for (let k = 0; k < count; k++, i++) {
      const dg = i % 11 === 10;
      const reefer = ctCode.includes('RF');
      out.push(await m.bookingSvc.create({
        voyageId: voyage._id, agentId: W.agent[agentCode]._id, containerTypeId: W.ct[ctCode]._id,
        freightRate: dg ? rate + 150 : rate, containerNumber: boxNo(), containerStatus: i % 9 === 8 ? 'Empty' : 'Full',
        shipper: SHIPPERS[i % SHIPPERS.length], consignee: SHIPPERS[(i + 3) % SHIPPERS.length], carrierName: 'Flow Marine',
        commodity: reefer ? 'Frozen food' : COMMODITIES[i % COMMODITIES.length], vgm: 8000 + i * 350,
        dg, imdgCode: dg ? 'IMDG Class 3' : null, status, remarks: null, ...extra,
      }, uid));
    }
  }
  return out;
};

const setVoyage = (id, data, uid) => m.voyageSvc.update(id, data, uid, true); // true = override: jump to any status
const voyagesOf = (roundId) => m.Voyage.find({ roundId }).sort({ sequence: 1 }).lean();

const invoiceFor = async (W, voyage, agentCode, { invoiceDate, dueDate, issue = true }, uid) => {
  const agentId = W.agent[agentCode]._id;
  const items = await m.items.listEligible({ billToAgentId: agentId, voyageId: voyage._id });
  if (!items.length) throw new Error(`no eligible items for ${agentCode} on ${voyage.voyageNumber}`);
  const draft = await m.billing.createDraft({
    invoiceType: 'Voyage', billToAgentId: agentId, voyageId: voyage._id, itemIds: items.map((i) => i._id),
    invoiceDate: iso(invoiceDate), dueDate: iso(dueDate), currency: 'USD', notes: 'Seed test data',
  }, uid);
  return issue ? m.billing.issue(draft._id, uid) : draft;
};
const receive = (inv, amountMinor, date, uid, partner) => m.billing.recordSettlement(inv._id, {
  amountMinor, date: iso(date), method: partner ? 'Cash' : 'Bank Transfer', reference: `RCPT-${String(inv.invoiceNumber).replace(/\W/g, '')}`,
  bankAccount: partner ? { type: 'Partner', partnerId: partner._id } : { type: 'Company' },
}, uid);
const fresh = (id) => m.Invoice.findById(id).lean();

const expense = (data, uid) => m.expenseSvc.create({ currency: 'USD', ...data }, null, uid);
/** estimate -> final -> posted */
const fullExpense = async (data, finalAmount, uid) => {
  const pda = await expense({ ...data, kind: 'PDA' }, uid);
  const { fda } = await m.expV2.convertToFda(String(pda._id), { amount: finalAmount, expenseDate: data.expenseDate }, uid);
  await m.expV2.postExpense(String(fda._id), uid);
  return fda;
};

// ─── Round A: completed and closed ───────────────────────────────────────────
const seedRoundA = async (W, user) => {
  const uid = user._id;
  const created = await m.roundSvc.create({
    roundName: 'TEST Round A - Completed & Closed', serviceId: W.service.ASME._id, vesselId: W.vessel.ALNOOR._id,
    startDate: daysAgo(130), endDate: daysAgo(40), status: 'Active', notes: 'Seed test data: full lifecycle, closed and settled',
  }, uid);
  const round = created.round;
  const [v1, v2, v3] = await voyagesOf(round._id);

  // v3 is billed to a Direct Line customer instead of the port agent
  await step('A: Final Loading bookings (3 voyages)', async () => {
    await makeBookings(W, v1, 'SHA-AG', [['20DRY', 1200, 14], ['40HC', 2100, 10], ['20RF', 2600, 3]], 'Final Loading', uid);
    await makeBookings(W, v2, 'SIN-AG', [['20DRY', 1250, 12], ['40HC', 2150, 12], ['40HCRF', 3300, 2]], 'Final Loading', uid);
    await makeBookings(W, v3, 'DXB-AG', [['20DRY', 1100, 10], ['40DRY', 1900, 8]], 'Final Loading', uid);
    await makeBookings(W, v3, 'DXB-AG', [['40HC', 2000, 6]], 'Final Loading', uid, { billToPartyId: W.agent['DL-ONE']._id, shipperSource: 'Direct', paymentTerm: 'Collect' });
  });
  await step('A: one cancelled booking', async () => {
    const [b] = await makeBookings(W, v1, 'SHA-AG', [['20DRY', 1200, 1]], 'Pending', uid);
    await m.Booking.updateOne({ _id: b._id }, { $set: { status: 'Cancelled' } });
  });

  await step('A: voyages departed, with dates', async () => {
    const t0 = new Date(round.startDate).getTime();
    for (const [i, v] of [v1, v2, v3].entries()) {
      await setVoyage(v._id, { etd: new Date(t0 + i * 14 * DAY), atd: new Date(t0 + i * 14 * DAY + 3600000), eta: new Date(t0 + (i + 1) * 14 * DAY), ata: new Date(t0 + (i + 1) * 14 * DAY + 7200000), status: 'Arrived' }, uid);
    }
  });

  await step('A: expenses (estimate -> final -> posted, every paid-by kind)', async () => {
    const d = (n) => daysAgo(n);
    // paid by the port agent -> we owe the agent (account 2000), used for netting below
    await fullExpense({ voyageId: v2._id, portId: v2.polId, expenseTypeId: W.et['Port Dues']._id, agentId: W.agent['SIN-AG']._id, paidBy: 'PortAgent', amount: 6200, expenseDate: d(100), description: 'Singapore port dues' }, 6480, uid);
    await fullExpense({ voyageId: v2._id, portId: v2.polId, expenseTypeId: W.et['Terminal Handling']._id, agentId: W.agent['SIN-AG']._id, paidBy: 'PortAgent', amount: 9800, expenseDate: d(99), description: 'THC Singapore' }, 9800, uid);
    await fullExpense({ voyageId: v3._id, portId: v3.polId, expenseTypeId: W.et['Port Dues']._id, agentId: W.agent['DXB-AG']._id, paidBy: 'PortAgent', amount: 7100, expenseDate: d(86), description: 'Jebel Ali port dues' }, 7350, uid);
    await fullExpense({ voyageId: v1._id, portId: v1.polId, expenseTypeId: W.et['Pilotage & Towage']._id, agentId: W.agent['SHA-AG']._id, paidBy: 'PortAgent', amount: 3900, expenseDate: d(116), description: 'Shanghai pilotage' }, 3900, uid);
    // paid by the company
    await fullExpense({ voyageId: v3._id, portId: v3.podId, expenseTypeId: W.et['Stevedoring']._id, paidBy: 'Company', amount: 5400, expenseDate: d(80), description: 'Stevedoring Jeddah' }, 5600, uid);
    await fullExpense({ roundId: round._id, expenseTypeId: W.et['Canal Dues']._id, paidBy: 'Company', amount: 11000, expenseDate: d(95), description: 'Bunker & canal dues' }, 11250, uid);
    // paid by partners out of their own pocket (partner current accounts)
    await fullExpense({ roundId: round._id, expenseTypeId: W.et['Hire Rate']._id, paidBy: 'Partner', paidByPartnerId: W.partner.BETA._id, amount: 42000, expenseDate: d(120), description: 'Hire - 90 days' }, 42000, uid);
    await fullExpense({ roundId: round._id, expenseTypeId: W.et['Agency Fees']._id, paidBy: 'Partner', paidByPartnerId: W.partner.GAMMA._id, amount: 3000, expenseDate: d(60), description: 'Agency fees' }, 3000, uid);
  });

  const invs = {};
  await step('A: invoices issued (per voyage and bill-to party)', async () => {
    invs.v1 = await invoiceFor(W, v1, 'SHA-AG', { invoiceDate: daysAgo(112), dueDate: daysAgo(82) }, uid);
    invs.v2 = await invoiceFor(W, v2, 'SIN-AG', { invoiceDate: daysAgo(98), dueDate: daysAgo(68) }, uid);
    invs.v3 = await invoiceFor(W, v3, 'DXB-AG', { invoiceDate: daysAgo(84), dueDate: daysAgo(39) }, uid);
    invs.dl = await invoiceFor(W, v3, 'DL-ONE', { invoiceDate: daysAgo(84), dueDate: daysAgo(69) }, uid);
  });
  await step('A: receipts (full, partial, collected by partners)', async () => {
    await receive(invs.v1, invs.v1.totalMinor, daysAgo(80), uid, W.partner.ALFA);        // Shanghai agent pays Alfa in cash
    await receive(invs.dl, invs.dl.totalMinor, daysAgo(65), uid, W.partner.GAMMA);       // direct line pays Gamma
    await receive(invs.v3, Math.round(invs.v3.totalMinor * 0.6), daysAgo(50), uid, null); // Jebel Ali: 60% to the company bank
    await receive(invs.v2, Math.round(invs.v2.totalMinor * 0.5), daysAgo(55), uid, W.partner.ALFA);
  });
  await step('A: credit note on the Singapore invoice', async () => {
    await m.billing.createNote(invs.v2._id, 'CreditNote', { amountMinor: M(450), reason: 'Damaged reefer - settlement agreed' }, uid);
  });
  await step('A: handling fees confirmed (Singapore, Jebel Ali)', async () => {
    await m.agentAcc.handlingConfirm(W.agent['SIN-AG']._id, round._id, uid);
    await m.agentAcc.handlingConfirm(W.agent['DXB-AG']._id, round._id, uid);
  });
  await step('A: Singapore payable netted against its open invoice', async () => {
    await m.agentAcc.offset(W.agent['SIN-AG']._id, { batchId: 'seed-offset-sin-1', strategy: 'oldest' }, uid);
  });
  await step('A: advance paid to and part-returned by Shanghai agent', async () => {
    await m.agentAcc.advance(W.agent['SHA-AG']._id, { amountMinor: M(5000), date: iso(daysAgo(118)), reference: 'ADV-001' }, uid);
    await m.agentAcc.returnAdvance(W.agent['SHA-AG']._id, { amountMinor: M(2000), date: iso(daysAgo(70)) }, uid);
  });
  await step('A: tracking history', async () => {
    await trackRound(W, round, [v1, v2, v3], user, 'done');
  });

  await step('A: voyages + round completed', async () => {
    for (const v of [v1, v2, v3]) await setVoyage(v._id, { status: 'Completed' }, uid);
    await m.roundSvc.update(round._id, { status: 'Completed' }, uid);
  });
  await step('A: partner settlement calculated, round closed (override + carry-forward to JV reserve)', async () => {
    const st = await m.ps.calculate(String(round._id), { mode: 'Accrual' }, user);
    const carry = st.profitMinor > 0 ? Math.floor(st.profitMinor * 0.1) : 0;
    await m.rc.close(String(round._id), { overrideReason: 'Seed data: close with open receivables', carryForwardMinor: carry }, user, { canOverride: true, canCarryForward: true });
  });
  await step('A: partner transfers (all but one paid)', async () => {
    const s = await m.ps.getSettlement(String(round._id));
    const open = (s.transfers || []).filter((t) => t.status === 'Suggested');
    for (const t of open.slice(0, Math.max(0, open.length - 1))) await m.ps.payTransfer(String(t._id), { date: iso(daysAgo(20)), reference: 'SEED-TRF' }, user);
  });
  return round;
};

// ─── tracking ────────────────────────────────────────────────────────────────
const trackRound = async (W, round, voyages, user, mode) => {
  const portKey = (portId) => Object.keys(W.port).find((k) => String(W.port[k]._id) === String(portId));
  const t0 = new Date(round.startDate).getTime();
  const plan = [];
  voyages.forEach((v, i) => {
    const base = t0 + i * 14 * DAY;
    plan.push({ v, portId: v.polId, status: 'At Port', at: base - DAY, remarks: 'Berthed, loading' });
    plan.push({ v, portId: v.polId, status: 'Departed', at: base, remarks: 'Sailed on schedule' });
    if (mode === 'done') {
      plan.push({ v, portId: v.podId, status: 'Arrived', at: base + 13 * DAY, remarks: 'Arrived at discharge port' });
      if (i === 1) plan.push({ v, portId: v.podId, status: 'Delayed', at: base + 14 * DAY, remarks: 'Waiting for berth (congestion)' });
    }
  });
  for (const p of plan) {
    if (p.at > Date.now()) continue;
    const k = portKey(p.portId);
    await m.trackingSvc.createEntry({
      voyageId: p.v._id, roundId: round._id, vesselId: round.vesselId._id || round.vesselId, serviceId: round.serviceId._id || round.serviceId,
      countryId: W.port[k].countryId, cityId: W.port[k].cityId, portId: p.portId, terminalId: W.terminal[k]._id,
      status: p.status, remarks: p.remarks, lastUpdate: new Date(p.at),
    }, user._id);
  }
};

// ─── Round B: active, every state ────────────────────────────────────────────
const seedRoundB = async (W, user) => {
  const uid = user._id;
  const created = await m.roundSvc.create({
    roundName: 'TEST Round B - Active', serviceId: W.service.GMED._id, vesselId: W.vessel.RSTAR._id,
    startDate: daysAgo(24), endDate: daysAhead(36), status: 'Active', notes: 'Seed test data: in-flight round, every booking/invoice state',
  }, uid);
  const round = created.round;
  const [v1, v2] = await voyagesOf(round._id);

  await step('B: bookings in every status', async () => {
    await makeBookings(W, v1, 'DXB-AG', [['20DRY', 1000, 12], ['40HC', 1800, 9], ['20RF', 2300, 3]], 'Final Loading', uid);
    await makeBookings(W, v1, 'DXB-AG', [['20DRY', 1000, 4]], 'Confirmed', uid);
    await makeBookings(W, v1, 'DXB-AG', [['40HC', 1800, 3]], 'Pending', uid);
    await makeBookings(W, v2, 'JED-AG', [['20DRY', 950, 10], ['40DRY', 1700, 6]], 'Final Loading', uid);
    await makeBookings(W, v2, 'JED-AG', [['40HC', 1750, 5]], 'Confirmed', uid);
    await makeBookings(W, v2, 'JED-AG', [['20DRY', 950, 4]], 'Pending', uid);
    const [x] = await makeBookings(W, v2, 'JED-AG', [['20DRY', 950, 1]], 'Pending', uid);
    await m.Booking.updateOne({ _id: x._id }, { $set: { status: 'Cancelled' } });
  });
  await step('B: voyage 1 arrived, voyage 2 departed', async () => {
    await setVoyage(v1._id, { atd: daysAgo(23), ata: daysAgo(12), status: 'Arrived' }, uid);
    await setVoyage(v2._id, { atd: daysAgo(10), eta: daysAhead(4), status: 'Departed' }, uid);
  });
  await step('B: discharge outcome on voyage 1 (some remain onboard)', async () => {
    const fl = await m.Booking.find({ voyageId: v1._id, status: 'Final Loading' }).sort({ _id: 1 }).lean();
    const remaining = fl.slice(0, 3).map((b) => b._id);
    await m.Booking.updateMany({ _id: { $in: fl.map((b) => b._id) } }, { $set: { dischargeStatus: 'Discharged', dischargedAt: daysAgo(11) } });
    await m.Booking.updateMany({ _id: { $in: remaining } }, { $set: { dischargeStatus: 'Remaining', dischargedAt: null } });
    require('../modules/capacity/capacity.service').invalidateRoundCache(round._id);
  });
  await step('B: Layer 1 manual bookings', async () => {
    const row = (ct, quantity, rate, extra = {}) => ({ containerTypeId: W.ct[ct]._id, quantity, rate, commodity: 'General cargo', vgm: 9000, ...extra });
    await m.manualSvc.create({ voyageId: v1._id, agentId: W.agent['DXB-AG']._id, cargoRows: [row('20DRY', 6, 980), row('40HC', 4, 1780)], status: 'Confirmed', remarks: 'Estimated, firm' }, uid);
    await m.manualSvc.create({ voyageId: v2._id, agentId: W.agent['JED-AG']._id, cargoRows: [row('20RF', 3, 2250, { commodity: 'Frozen food' }), row('20OT', 2, 1500, { dg: true, dgValue: 'Class 3, UN1203' })], status: 'Pending' }, uid);
    await m.manualSvc.create({ voyageId: v2._id, agentId: W.agent['PSD-AG']._id, cargoRows: [row('40HC', 8, 1650)], status: 'Final Loading' }, uid);
  });
  await step('B: expenses (one open PDA estimate, others posted)', async () => {
    await fullExpense({ voyageId: v1._id, portId: v1.polId, expenseTypeId: W.et['Port Dues']._id, agentId: W.agent['DXB-AG']._id, paidBy: 'PortAgent', amount: 6800, expenseDate: daysAgo(22), description: 'Jebel Ali port dues' }, 6950, uid);
    await fullExpense({ roundId: round._id, expenseTypeId: W.et['Hire Rate']._id, paidBy: 'Partner', paidByPartnerId: W.partner.ALFA._id, amount: 30000, expenseDate: daysAgo(24), description: 'Hire - 60 days' }, 30000, uid);
    await expense({ voyageId: v2._id, portId: v2.polId, expenseTypeId: W.et['Terminal Handling']._id, agentId: W.agent['JED-AG']._id, paidBy: 'PortAgent', kind: 'PDA', amount: 8800, expenseDate: daysAgo(9), description: 'THC Jeddah (estimate, no final yet)' }, uid);
    await expense({ voyageId: v2._id, portId: v2.podId, expenseTypeId: W.et['Miscellaneous']._id, paidBy: 'Company', kind: 'FDA', amount: 420, expenseDate: daysAgo(3), description: 'Unposted FDA (awaiting approval)' }, uid);
  });
  const invs = {};
  await step('B: invoices in every state', async () => {
    // v1 FL bookings are one pricing group per rate: bill by pricing group so we can leave several states
    const items = await m.items.listEligible({ billToAgentId: W.agent['DXB-AG']._id, voyageId: v1._id });
    const draftFor = (itemIds, invoiceDate, dueDate) => m.billing.createDraft({
      invoiceType: 'Voyage', billToAgentId: W.agent['DXB-AG']._id, voyageId: v1._id, itemIds, invoiceDate: iso(invoiceDate), dueDate: iso(dueDate), currency: 'USD', notes: 'Seed test data',
    }, uid);
    const [a, b, c] = items;
    if (a) invs.overdue = await m.billing.issue((await draftFor([a._id], daysAgo(60), daysAgo(15)))._id, uid);   // Issued + past due -> Overdue
    if (b) invs.partial = await m.billing.issue((await draftFor([b._id], daysAgo(18), daysAhead(12)))._id, uid);  // partly paid
    if (c) invs.draft = await draftFor([c._id], daysAgo(2), daysAhead(28));                                         // stays Draft
    invs.paid = await invoiceFor(W, v2, 'JED-AG', { invoiceDate: daysAgo(8), dueDate: daysAhead(22) }, uid);      // fully paid
  });
  await step('B: receipts', async () => {
    if (invs.partial) await receive(invs.partial, Math.round(invs.partial.totalMinor * 0.4), daysAgo(6), uid, W.partner.ALFA);
    if (invs.paid) await receive(invs.paid, invs.paid.totalMinor, daysAgo(2), uid, null);
  });
  await step('B: debit note on the overdue invoice', async () => {
    if (invs.overdue) await m.billing.createNote(invs.overdue._id, 'DebitNote', { amountMinor: M(250), reason: 'Demurrage' }, uid);
  });
  await step('B: handling fees + advance for Jeddah', async () => {
    await m.agentAcc.handlingConfirm(W.agent['JED-AG']._id, round._id, uid);
    await m.agentAcc.advance(W.agent['JED-AG']._id, { amountMinor: M(3000), date: iso(daysAgo(8)), reference: 'ADV-002', roundId: round._id }, uid);
  });
  await step('B: tracking history', async () => { await trackRound(W, round, [v1, v2], user, 'live'); });
  return round;
};

// ─── Round C: planned ────────────────────────────────────────────────────────
const seedRoundC = async (W, user) => {
  const uid = user._id;
  const created = await m.roundSvc.create({
    roundName: 'TEST Round C - Planned', serviceId: W.service.ASME._id, vesselId: W.vessel.GPION._id,
    startDate: daysAhead(30), endDate: daysAhead(100), status: 'Planned', notes: 'Seed test data: not started yet',
  }, uid);
  const [v1, v2] = await voyagesOf(created.round._id);
  await step('C: advance manual bookings', async () => {
    const row = (ct, quantity, rate) => ({ containerTypeId: W.ct[ct]._id, quantity, rate, commodity: 'Machinery parts', vgm: 12000 });
    await m.manualSvc.create({ voyageId: v1._id, agentId: W.agent['SHA-AG']._id, cargoRows: [row('40HC', 10, 2200), row('20DRY', 6, 1300)], status: 'Confirmed' }, uid);
    await m.manualSvc.create({ voyageId: v2._id, agentId: W.agent['SIN-AG']._id, cargoRows: [row('40DRY', 5, 1900)], status: 'Pending' }, uid);
  });
  return created.round;
};

// ─── verification ────────────────────────────────────────────────────────────
const verify = async () => {
  const counts = {};
  for (const [k, Model] of Object.entries({
    rounds: m.Round, voyages: m.Voyage, bookings: m.Booking, manualBookings: m.ManualBooking, expenses: m.Expense, invoices: m.Invoice,
    agents: m.Agent, vessels: m.Vessel, partners: m.Partner,
  })) counts[k] = await Model.countDocuments();
  counts.journalEntries = await mongoose.model('JournalEntry').countDocuments();
  const tb = await m.ledger.trialBalance({});
  return { counts, balanced: tb.balanced };
};

const run = async () => {
  assertSafeTarget();
  const host = URI.replace(/\/\/[^@]*@/, '//***@').split('?')[0];
  console.log(`\nSeeding test data into ${host}${RESET ? '  (--reset)' : ''}\n`);
  await mongoose.connect(URI);
  if (RESET) { await mongoose.connection.dropDatabase(); console.log('  database dropped'); }

  load();
  await Promise.all(Object.values(mongoose.models).map((mod) => mod.init())); // unique/partial indexes must exist before the money paths race on them

  console.log('Base data (roles, permissions, users, chart of accounts)');
  await require('./seed').seed();

  const admin = await m.User.findOne({ email: (process.env.ADMIN_EMAIL || 'admin@logistics.com').toLowerCase() }).lean();
  if (!admin) throw new Error('Admin user missing after base seed');
  const user = { _id: admin._id, email: admin.email, name: admin.name };

  console.log('Master data');
  const W = await step('master data', () => seedMasterData(admin._id));
  if (!W) throw new Error('Master data failed - cannot continue');
  await step('partners, JV shares, agent agreements', () => seedPartnersAndAgreements(W, admin._id));

  if (await m.Round.exists({ roundName: /^TEST Round / })) {
    console.log('\nOperational test data already present - skipping (use --reset to wipe and rebuild).');
  } else {
    console.log('\nRound A - completed and closed');
    await seedRoundA(W, user).catch((e) => { results.push({ name: 'Round A', ok: false, error: e.message }); console.log(`  FAIL  Round A: ${e.message}`); });
    console.log('\nRound B - active');
    await seedRoundB(W, user).catch((e) => { results.push({ name: 'Round B', ok: false, error: e.message }); console.log(`  FAIL  Round B: ${e.message}`); });
    console.log('\nRound C - planned');
    await seedRoundC(W, user).catch((e) => { results.push({ name: 'Round C', ok: false, error: e.message }); console.log(`  FAIL  Round C: ${e.message}`); });
  }

  const v = await verify();
  console.log('\nTotals:', JSON.stringify(v.counts));
  console.log(`Ledger trial balance balanced: ${v.balanced}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps ok${failed.length ? `, ${failed.length} FAILED:` : ''}`);
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  console.log(`\nLogins: ${process.env.ADMIN_EMAIL || 'admin@logistics.com'} / ADMIN_PASSWORD from .env (SuperAdmin); ops|finance|tracking|viewer@logistics.com / Demo@123456\n`);
  return failed.length === 0 && v.balanced;
};

if (require.main === module) {
  run()
    .then(async (ok) => { await mongoose.disconnect(); process.exit(ok ? 0 : 2); })
    .catch(async (e) => { logger.error(`[SeedTestData] ${e.message}`); console.error(e.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
}

module.exports = { run };
