'use strict';
// API-level integration tests for Version 2: a REAL server process, real HTTP, real cookies,
// real CSRF tokens, real RBAC. Runs only when TEST_MONGODB_URI is set (local replica set;
// the database is DROPPED; Atlas URIs are refused). See v2.int.test.js for setup.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const URI = process.env.TEST_MONGODB_URI;
const SKIP = !URI ? 'TEST_MONGODB_URI not set' : false;
if (URI && /mongodb\+srv|mongodb\.net/i.test(URI)) throw new Error('Refusing to run integration tests against Atlas');

const PORT = 5056;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const SECRET = 'api-test-secret-api-test-secret-123456';
const oid = () => new mongoose.Types.ObjectId();

let server; let m; let W; let seq = 0;
const uniq = (p) => `${p}${Date.now().toString(36)}${++seq}`;

// ── tiny HTTP client with a cookie jar and the CSRF token ──────────────────────
class Client {
  constructor(name) { this.name = name; this.token = null; this.csrf = null; }
  async login(email, password) {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(r.status, 200, `login ${email}: ${await r.clone().text()}`);
    this.token = (r.headers.getSetCookie().find((c) => c.startsWith('token=')) || '').split(';')[0].slice(6);
    this.csrf = r.headers.get('x-csrf-token');
    assert.ok(this.token && this.csrf, 'cookie + csrf token issued');
    return this;
  }
  async req(method, url, body, { csrf = true, raw = false } = {}) {
    const headers = { Cookie: `token=${this.token}` };
    let payload;
    if (body instanceof FormData) payload = body; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    const r = await fetch(`${BASE}${url}`, { method, headers, body: payload });
    if (raw) return r;
    let json = null; try { json = await r.json(); } catch { /* not json */ }
    return { status: r.status, body: json, data: json?.data, code: json?.code };
  }
  get(u) { return this.req('GET', u); }
  post(u, b, o) { return this.req('POST', u, b === undefined ? {} : b, o); }
  put(u, b, o) { return this.req('PUT', u, b, o); }
  del(u, o) { return this.req('DELETE', u, undefined, o); }
}
const anon = async (method, url, body) => {
  const r = await fetch(`${BASE}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, body: j, code: j?.code };
};

const waitHealthy = async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('server did not start');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const perm = (roleId, module, actions) => ({ roleId, module, actions });
const grant = async (client, roleId, map) => { // map: { module: [actions] } via the REAL permissions API
  const payload = Object.entries(map).map(([module, acts]) => ({ module, actions: Object.fromEntries(acts.map((a) => [a, true])) }));
  const r = await client.put(`/permissions/${roleId}`, { permissions: payload });
  assert.equal(r.status, 200, JSON.stringify(r.body));
};

describe('Version 2 API (real server, cookies, CSRF, RBAC)', { skip: SKIP }, () => {
  let admin; let fin; let viewer;

  before(async () => {
    await mongoose.connect(URI);
    await mongoose.connection.dropDatabase();
    m = {
      Role: require('../../src/modules/roles/role.model'), User: require('../../src/modules/users/user.model'),
      Permission: require('../../src/modules/permissions/permission.model'),
      Booking: require('../../src/modules/bookings/booking.model'), Round: require('../../src/modules/rounds/round.model'),
      Voyage: require('../../src/modules/voyages/voyage.model'), Vessel: require('../../src/modules/vessels/vessel.model'),
      Service: require('../../src/modules/services/service.model'), ContainerType: require('../../src/modules/containerTypes/containerType.model'),
      ExpenseType: require('../../src/modules/expenseTypes/expenseType.model'), Agent: require('../../src/modules/agents/agent.model'),
      Partner: require('../../src/modules/partners/partner.model'), Expense: require('../../src/modules/expenses/expense.model'),
      Invoice: require('../../src/modules/invoices/invoice.model'), AuditLog: require('../../src/modules/auditLogs/auditLog.model'),
    };
    ['locations/port', 'locations/city', 'locations/country'].forEach((n) => require(`../../src/modules/${n}.model`));
    await Promise.all(Object.values(mongoose.models).map((x) => x.init()));
    await require('../../src/modules/ledger/accounts.seed').seedAccounts();

    const pw = await bcrypt.hash('Passw0rd!x', 4);
    const adminRole = await m.Role.create({ name: 'SuperAdmin', isSystem: true });
    const finRole = await m.Role.create({ name: 'Finance', isSystem: false });
    const viewRole = await m.Role.create({ name: 'Viewer', isSystem: false });
    await m.User.create({ name: 'Admin', email: 'admin@t.io', password: pw, roleId: adminRole._id });
    await m.User.create({ name: 'Fin', email: 'fin@t.io', password: pw, roleId: finRole._id });
    await m.User.create({ name: 'View', email: 'view@t.io', password: pw, roleId: viewRole._id });
    // baseline: Finance and Viewer can only READ the modules they need
    const read = (roleId, mod) => m.Permission.create(perm(roleId, mod, { read: true, view: true }));
    for (const mod of ['invoices', 'expenses', 'agents', 'rounds', 'vessels', 'partners', 'ledger', 'reports']) {
      await read(finRole._id, mod); await read(viewRole._id, mod);
    }
    W = { adminRole, finRole, viewRole, pol: oid(), pod: oid() };
    W.service = await m.Service.create({ serviceCode: 'SVC', serviceName: 'S' });
    W.ct = await m.ContainerType.create({ code: 'C20', size: '20ft', type: 'Dry' });
    W.etype = await m.ExpenseType.create({ name: 'Port charges', category: 'Port Expense' });
    W.agent = await m.Agent.create({ agentName: 'OGA', agentCode: 'OGA' });
    W.direct = await m.Agent.create({ agentName: 'DL', agentCode: 'DL', partyType: 'DirectLine' });
    W.vessel = await m.Vessel.create({ vesselCode: 'V1', vesselName: 'MV T', imoNumber: '9100001', ownershipType: 'Owned' });

    server = spawn(process.execPath, [path.join(__dirname, '../../src/server.js')], {
      env: { ...process.env, MONGODB_URI: URI, PORT: String(PORT), NODE_ENV: 'development', JWT_SECRET: SECRET, SMTP_EMAIL: 'x@x.io', SMTP_APP_PASSWORD: 'x', ALLOWED_ORIGIN: 'http://localhost:3000', FRONTEND_URL: 'http://localhost:3000' },
      stdio: 'ignore',
    });
    await waitHealthy();
    admin = await new Client('admin').login('admin@t.io', 'Passw0rd!x');
    fin = await new Client('fin').login('fin@t.io', 'Passw0rd!x');
    viewer = await new Client('view').login('view@t.io', 'Passw0rd!x');
  });
  after(async () => { server?.kill(); await mongoose.disconnect(); });

  const mkRound = async (voyageStatus = 'Completed') => {
    const round = await m.Round.create({ roundNumber: uniq('R'), serviceId: W.service._id, vesselId: W.vessel._id, startDate: new Date('2026-01-01'), endDate: new Date('2026-02-01'), status: 'Active' });
    const voyage = await m.Voyage.create({ voyageNumber: uniq('V'), roundId: round._id, serviceId: W.service._id, polId: W.pol, podId: W.pod, sequence: 1, status: voyageStatus });
    round.voyageIds = [voyage._id]; await round.save();
    return { round, voyage };
  };
  const mkBookings = async (voyageId, agentId, n, rate) => {
    for (let i = 0; i < n; i++) {
      await m.Booking.create({ bookingNumber: uniq('BK'), voyageId, agentId, polId: W.pol, podId: W.pod, containerTypeId: W.ct._id, freightRate: rate, totalFreight: rate, containerNumber: uniq('MSCU').toUpperCase().slice(0, 11), status: 'Final Loading', containerStatus: 'Full' });
    }
  };

  describe('authentication and CSRF', () => {
    it('every V2 endpoint refuses an anonymous caller (401)', async () => {
      for (const [method, url] of [['GET', '/partners'], ['GET', '/ledger/trial-balance'], ['GET', '/invoices/items'],
        ['POST', `/agent-accounts/${W.agent._id}/offset`], ['POST', `/round-accounting/rounds/${oid()}/close`]]) {
        assert.equal((await anon(method, url, method === 'POST' ? {} : undefined)).status, 401, `${method} ${url}`);
      }
    });

    it('a state-changing request without / with a wrong CSRF token is refused (403 CSRF_INVALID)', async () => {
      const none = await admin.post('/partners', { name: 'Forged', code: 'FRG' }, { csrf: false });
      assert.equal(none.status, 403); assert.equal(none.code, 'CSRF_INVALID');
      const bad = await fetch(`${BASE}/partners`, { method: 'POST', headers: { Cookie: `token=${admin.token}`, 'X-CSRF-Token': 'deadbeef', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Forged', code: 'FRG' }) });
      assert.equal(bad.status, 403);
    });
  });

  describe('permission boundaries (audit H2 / M6) and the new actions', () => {
    it("a role cannot read another role's matrix, can read its own, cannot edit its own", async () => {
      assert.equal((await fin.get(`/permissions/${W.adminRole._id}`)).status, 403);
      assert.equal((await fin.get(`/permissions/${W.finRole._id}`)).status, 200);
      assert.equal((await fin.put(`/permissions/${W.finRole._id}`, { permissions: [{ module: 'invoices', actions: { read: true, issue: true } }] })).status, 403);
      assert.equal((await admin.put(`/permissions/${W.finRole._id}`, { wrong: true })).status, 400); // malformed body is a 400, not a 500
    });

    it('the permissions API stores and enforces the new V2 actions (and the cache is invalidated)', async () => {
      assert.equal((await fin.get('/partners')).status, 200);                // partners:read from the baseline
      assert.equal((await fin.post('/partners', { code: 'PX', name: 'No manage' })).status, 403);
      await grant(admin, W.finRole._id, { invoices: ['read', 'view', 'create', 'issue', 'cancel', 'record'], expenses: ['read', 'view', 'create', 'update', 'approve'], agents: ['read', 'view', 'update', 'offset'], rounds: ['read', 'view', 'close', 'reopen'], partners: ['read', 'view', 'manage'], vessels: ['read', 'view'], ledger: ['read', 'view'], reports: ['read'] });
      const stored = (await admin.get(`/permissions/${W.finRole._id}`)).data.find((p) => p.module === 'invoices');
      assert.equal(stored.actions.issue, true); assert.equal(stored.actions.record, true);
      assert.equal((await fin.post('/partners', { code: 'PX', name: 'Now allowed' })).status, 201);
    });
  });

  describe('partners and vessel shares over HTTP', () => {
    let pa; let pb;
    it('validates input with field errors and a stable body shape', async () => {
      const r = await fin.post('/partners', { code: '', name: '' });
      assert.equal(r.status, 400); assert.ok(Array.isArray(r.body.errors) && r.body.errors.length >= 1);
      const dup = await fin.post('/partners', { code: 'PX', name: 'Duplicate code' });
      assert.equal(dup.status, 409);
    });
    it('shares: not 100% -> 400 SHARES_NOT_100; valid -> saved; a delete is blocked with counts', async () => {
      pa = (await fin.post('/partners', { code: 'PA', name: 'Partner A' })).data;
      pb = (await fin.post('/partners', { code: 'PB', name: 'Partner B' })).data;
      const vid = W.vessel._id;
      const bad = await fin.put(`/vessels/${vid}/partners`, { shares: [{ partnerId: pa._id, shareBp: 6000, isLead: true }, { partnerId: pb._id, shareBp: 3000 }] });
      assert.equal(bad.status, 400); assert.equal(bad.code, 'SHARES_NOT_100');
      const good = await fin.put(`/vessels/${vid}/partners`, { shares: [{ partnerId: pa._id, shareBp: 6000, isLead: true }, { partnerId: pb._id, shareBp: 4000 }] });
      assert.equal(good.status, 200); assert.equal(good.data.length, 2);
      const del = await fin.del(`/partners/${pa._id}`);
      assert.equal(del.status, 409); assert.equal(del.code, 'HAS_DEPENDENTS'); assert.match(del.body.message, /vessel share rows/);
      assert.equal((await viewer.put(`/vessels/${vid}/partners`, { shares: [] })).status, 403);
    });
  });

  describe('invoicing over HTTP', () => {
    let R; let draft; let items;
    before(async () => { R = await mkRound(); await mkBookings(R.voyage._id, W.agent._id, 3, 100); });

    it('lists eligible items, creates a draft; a viewer cannot create', async () => {
      items = (await fin.get(`/invoices/items?billToAgentId=${W.agent._id}&voyageId=${R.voyage._id}`)).data;
      assert.equal(items.length, 1); assert.equal(items[0].loadedQty, 3);
      const body = { invoiceType: 'Voyage', billToAgentId: String(W.agent._id), voyageId: String(R.voyage._id), itemIds: [items[0]._id], invoiceDate: '2026-02-01', dueDate: '2099-01-01', currency: 'USD' };
      assert.equal((await viewer.post('/invoices', body)).status, 403);
      const bad = await fin.post('/invoices', { ...body, itemIds: [] });
      assert.equal(bad.status, 400);
      const ok = await fin.post('/invoices', body);
      assert.equal(ok.status, 201); draft = ok.data;
      assert.equal(draft.totalMinor, 30000);
      assert.equal((await fin.post('/invoices', body)).code, 'DUPLICATE_BILLING');
    });

    it('issue needs invoices:issue; settlements need invoices:record', async () => {
      await grant(admin, W.finRole._id, { invoices: ['read', 'view', 'create'], expenses: ['read', 'view', 'create', 'update', 'approve'], agents: ['read', 'view', 'update', 'offset'], rounds: ['read', 'view', 'close', 'reopen'], partners: ['read', 'view', 'manage'], vessels: ['read', 'view'], ledger: ['read', 'view'], reports: ['read'] });
      assert.equal((await fin.post(`/invoices/${draft._id}/issue`)).status, 403);
      await grant(admin, W.finRole._id, { invoices: ['read', 'view', 'create', 'issue'], expenses: ['read', 'view', 'create', 'update', 'approve'], agents: ['read', 'view', 'update', 'offset'], rounds: ['read', 'view', 'close', 'reopen'], partners: ['read', 'view', 'manage'], vessels: ['read', 'view'], ledger: ['read', 'view'], reports: ['read'] });
      const issued = await fin.post(`/invoices/${draft._id}/issue`);
      assert.equal(issued.status, 200); assert.equal(issued.data.status, 'Issued');
      assert.equal((await fin.post(`/invoices/${draft._id}/issue`)).code, 'INVOICE_NOT_DRAFT');
      assert.equal((await fin.post(`/invoices/${draft._id}/settlements`, { amountMinor: 1000 })).status, 403); // no record
    });

    it('an issued invoice is locked against edits and deletion, even for SuperAdmin', async () => {
      const r = await admin.put(`/invoices/${draft._id}`, { notes: 'sneaky', status: 'Paid' });
      assert.equal(r.status, 409); assert.equal(r.code, 'INVOICE_LOCKED');
      const del = await admin.del(`/invoices/${draft._id}`);
      assert.equal(del.status, 409); assert.equal(del.code, 'INVOICE_POSTED');
    });

    it('records a settlement; over-payment -> 409 SETTLEMENT_EXCEEDS_BALANCE; validation of amounts', async () => {
      const a = await admin.post(`/invoices/${draft._id}/settlements`, { amountMinor: 10000, method: 'Bank Transfer', date: '2026-02-10' });
      assert.equal(a.status, 201);
      assert.equal((await admin.post(`/invoices/${draft._id}/settlements`, { amountMinor: 99999 })).code, 'SETTLEMENT_EXCEEDS_BALANCE');
      assert.equal((await admin.post(`/invoices/${draft._id}/settlements`, { amountMinor: -5 })).status, 400);
      assert.equal((await admin.post(`/invoices/${draft._id}/settlements`, { amountMinor: 12.5 })).status, 400);
      const list = (await admin.get(`/invoices/${draft._id}/settlements`)).data;
      assert.equal(list.length, 1);
      assert.equal((await admin.get(`/invoices/${draft._id}`)).data.status, 'Partially Paid');
    });

    it('the trial balance endpoint is balanced', async () => {
      const tb = (await admin.get('/ledger/trial-balance')).data;
      assert.equal(tb.balanced, true);
      assert.ok(tb.rows.length >= 3);
    });
  });

  describe('expenses, agents and netting over HTTP', () => {
    let pda; let fda;
    const form = (o) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.append(k, v)); return f; };
    const base = () => ({ expenseTypeId: String(W.etype._id), amount: '400', currency: 'USD', expenseDate: '2026-02-05' });

    it('multipart expense create with PDA/paid-by; "Partner" without a partner is refused', async () => {
      const R = await mkRound();
      pda = await fin.req('POST', '/expenses', form({ ...base(), roundId: String(R.round._id), agentId: String(W.agent._id), kind: 'PDA', paidBy: 'PortAgent' }));
      assert.equal(pda.status, 201); assert.equal(pda.data.kind, 'PDA');
      const bad = await fin.req('POST', '/expenses', form({ ...base(), roundId: String(R.round._id), paidBy: 'Partner' }));
      assert.equal(bad.status, 400);
    });

    it('convert-fda / post require expenses:approve; PDA is not postable', async () => {
      assert.equal((await viewer.post(`/expenses/${pda.data._id}/convert-fda`, { amount: 450 })).status, 403);
      assert.equal((await fin.post(`/expenses/${pda.data._id}/post`)).code, 'PDA_NOT_POSTABLE');
      const c = await fin.post(`/expenses/${pda.data._id}/convert-fda`, { amount: 450 });
      assert.equal(c.status, 201); assert.equal(c.data.varianceMinor, 5000);
      fda = c.data.fda;
      assert.equal((await fin.post(`/expenses/${pda.data._id}/convert-fda`, { amount: 450 })).code, 'PDA_ALREADY_CONVERTED');
      const p = await fin.post(`/expenses/${fda._id}/post`);
      assert.equal(p.status, 200); assert.ok(p.data.ledgerEntryId);
      const upd = await fin.req('PUT', `/expenses/${fda._id}`, form({ amount: '1' }));
      assert.equal(upd.status, 409); assert.equal(upd.code, 'EXPENSE_POSTED');
      assert.equal((await fin.del(`/expenses/${fda._id}`)).status, 403); // Finance has no delete permission
      assert.equal((await admin.del(`/expenses/${fda._id}`)).code, 'EXPENSE_POSTED');
    });

    it('agent SOA shows the posted payable; offset validates, needs agents:offset, refuses Direct Line', async () => {
      const soa = await fin.get(`/agent-accounts/${W.agent._id}/soa?currency=USD`);
      assert.equal(soa.status, 200); // open invoice balance +20,000 (30,000 less a 10,000 receipt) and payable -45,000
      assert.equal(soa.data.closingMinor, -25000);
      assert.equal(soa.data.direction, 'WeOweAgent');
      assert.equal((await admin.post(`/agent-accounts/${W.agent._id}/offset`, {})).status, 400); // batchId required
      assert.equal((await viewer.post(`/agent-accounts/${W.agent._id}/offset`, { batchId: 'v1' })).status, 403);
      const dl = await admin.post(`/agent-accounts/${W.direct._id}/offset`, { batchId: 'dl-1' });
      assert.equal(dl.status, 409); assert.equal(dl.code, 'DIRECT_LINE_NO_OFFSET');
      const r1 = await admin.post(`/agent-accounts/${W.agent._id}/offset`, { batchId: 'api-b1', strategy: 'oldest' });
      assert.equal(r1.status, 200); assert.equal(r1.data.duplicate, false);
      assert.equal((await admin.post(`/agent-accounts/${W.agent._id}/offset`, { batchId: 'api-b1', strategy: 'oldest' })).data.duplicate, true);
    });

    it('advance and pay-agent need agents:offset and respect the payable ceiling', async () => {
      assert.equal((await viewer.post(`/agent-accounts/${W.agent._id}/pay`, { amountMinor: 100 })).status, 403);
      const over = await admin.post(`/agent-accounts/${W.agent._id}/pay`, { amountMinor: 99999999 });
      assert.equal(over.status, 409); assert.equal(over.code, 'PAYMENT_EXCEEDS_PAYABLE');
      assert.equal((await admin.post(`/agent-accounts/${W.agent._id}/advance`, { amountMinor: 1.5 })).status, 400);
    });

    it('agreements CRUD with validation', async () => {
      const bad = await admin.post(`/agent-accounts/${W.agent._id}/agreements`, { validFrom: 'nope' });
      assert.equal(bad.status, 400);
      const ok = await admin.post(`/agent-accounts/${W.agent._id}/agreements`, { validFrom: '2026-01-01', currency: 'USD', handlingFees: [{ moveType: 'Load', containerStatus: 'Full', amountMinor: 6000 }], commission: { rule: 'fixedPerBooking', amountMinor: 500 } });
      assert.equal(ok.status, 201);
      assert.equal((await admin.get(`/agent-accounts/${W.agent._id}/agreements`)).data.length, 1);
    });
  });

  describe('round closing over HTTP (and the money audit trail)', () => {
    let R;
    before(async () => {
      R = await mkRound('Completed');
      await m.Expense.create({ roundId: R.round._id, expenseTypeId: W.etype._id, agentId: W.agent._id, amount: 10, currency: 'USD', expenseDate: new Date(), kind: 'PDA' });
    });

    it('checklist reports the open PDA; close needs round:close; override needs a reason AND the override permission', async () => {
      const cl = (await fin.get(`/round-accounting/rounds/${R.round._id}/checklist`)).data;
      assert.equal(cl.canClose, false); assert.equal(cl.blockers[0].code, 'ROUND_HAS_OPEN_PDA');
      assert.equal((await viewer.post(`/round-accounting/rounds/${R.round._id}/close`, {})).status, 403);
      const noOverride = await fin.post(`/round-accounting/rounds/${R.round._id}/close`, {});
      assert.equal(noOverride.status, 409); assert.equal(noOverride.code, 'ROUND_HAS_OPEN_PDA');
      const finTry = await fin.post(`/round-accounting/rounds/${R.round._id}/close`, { overrideReason: 'abandoned' });
      assert.equal(finTry.code, 'ROUND_HAS_OPEN_PDA'); // Finance lacks closeOverride
      assert.equal((await admin.post(`/round-accounting/rounds/${R.round._id}/close`, {})).code, 'OVERRIDE_REASON_REQUIRED');
    });

    it('closes with an override; the Round then rejects changes over HTTP with ROUND_CLOSED', async () => {
      const ok = await admin.post(`/round-accounting/rounds/${R.round._id}/close`, { overrideReason: 'estimate abandoned', mode: 'Accrual' });
      assert.equal(ok.status, 200);
      const f = new FormData(); f.append('expenseTypeId', String(W.etype._id)); f.append('amount', '5'); f.append('currency', 'USD'); f.append('expenseDate', '2026-02-06'); f.append('roundId', String(R.round._id));
      const exp = await fin.req('POST', '/expenses', f);
      assert.equal(exp.status, 409); assert.equal(exp.code, 'ROUND_CLOSED');
      assert.equal((await admin.put(`/rounds/${R.round._id}`, { notes: 'x' })).code, 'ROUND_CLOSED');
      assert.equal((await admin.del(`/rounds/${R.round._id}`)).code, 'ROUND_CLOSED');
    });

    it('records the close and the refusals in the audit log with reason / success flags', async () => {
      await sleep(600); // audit writes are fire-and-forget
      const logs = await m.AuditLog.find({ 'newValues._event': { $in: ['round.close', 'round.close.override'] } }).lean();
      assert.ok(logs.some((l) => l.newValues._event === 'round.close.override' && l.newValues._success === true && l.newValues._reason === 'estimate abandoned'));
      assert.ok(logs.some((l) => l.newValues._event === 'round.close' && l.newValues._success === false)); // the refused attempts
    });

    it('reopen needs round:reopen and a reason; afterwards the Round accepts changes again', async () => {
      assert.equal((await viewer.post(`/round-accounting/rounds/${R.round._id}/reopen`, { reason: 'x' })).status, 403);
      assert.equal((await admin.post(`/round-accounting/rounds/${R.round._id}/reopen`, {})).status, 400);
      assert.equal((await admin.post(`/round-accounting/rounds/${R.round._id}/reopen`, { reason: 'late invoice' })).status, 200);
      assert.equal((await admin.put(`/rounds/${R.round._id}`, { notes: 'edited again' })).status, 200);
    });

    it('serves the partner settlement sheet as an Excel file', async () => {
      const calc = await fin.post(`/round-accounting/rounds/${R.round._id}/partner-settlement`, { mode: 'Accrual' });
      assert.equal(calc.status, 200);
      const x = await fin.req('GET', `/round-accounting/rounds/${R.round._id}/partner-settlement/excel`, undefined, { raw: true });
      assert.equal(x.status, 200);
      assert.match(x.headers.get('content-type'), /spreadsheetml/);
      const buf = Buffer.from(await x.arrayBuffer());
      assert.equal(buf.slice(0, 2).toString(), 'PK'); // xlsx = zip
    });

    it('Round P&L accepts ?basis= and returns the additive ledger block, legacy fields intact', async () => {
      const r = await fin.get(`/reports/round-pnl?roundId=${R.round._id}&basis=cash`);
      assert.equal(r.status, 200);
      assert.equal(r.data.ledgerPnl.basis, 'Cash');
      assert.ok('summary' in r.data && 'expenseTotals' in r.data);
      assert.equal((await fin.get(`/reports/round-pnl?roundId=${R.round._id}`)).data.ledgerPnl, null);
    });
  });
});
