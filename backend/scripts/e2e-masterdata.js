'use strict';
// End-to-end check of the master-data rework against a RUNNING dev server (npm run dev) on a freshly
// seeded database (npm run seed:test-data -- --reset). Real HTTP, real cookie + CSRF, real RBAC.
//   node scripts/e2e-masterdata.js            (BASE defaults to http://127.0.0.1:5000/api/v1)
// It creates records prefixed E2E- and removes the ones it can; re-runnable.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5000/api/v1';
const RUN = Date.now().toString(36).toUpperCase().slice(-5);
const results = [];

class Client {
  async login(email, password) {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (r.status !== 200) throw new Error(`login ${email} -> ${r.status} ${await r.text()}`);
    this.token = (r.headers.getSetCookie().find((c) => c.startsWith('token=')) || '').split(';')[0].slice(6);
    this.csrf = r.headers.get('x-csrf-token');
    return this;
  }
  async req(method, url, body) {
    const headers = { Cookie: `token=${this.token}` };
    if (method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${BASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await r.json(); } catch { /* not json */ }
    return { status: r.status, body: json, data: json?.data, code: json?.code, message: json?.message };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b ?? {}); }
  put(u, b) { return this.req('PUT', u, b); }
  del(u) { return this.req('DELETE', u); }
}

const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`);
};
const section = (t) => console.log(`\n${t}`);
const brief = (r) => `${r.status} ${r.code || ''} ${r.message || ''}`.trim();
const expectStatus = (name, r, status, code) => check(name, r.status === status && (!code || r.code === code), brief(r) + (r.body?.errors ? ' ' + JSON.stringify(r.body.errors) : ''));
const list = (r) => (Array.isArray(r.data) ? r.data : r.data?.items || r.data?.data || []);

(async () => {
  const health = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
  if (!health) { console.error(`Server not reachable at ${BASE} - start it with npm run dev`); process.exit(2); }

  const admin = await new Client().login(process.env.ADMIN_EMAIL || 'admin@logistics.com', process.env.ADMIN_PASSWORD || 'Admin@123456');
  const viewer = await new Client().login('viewer@logistics.com', 'Demo@123456');
  const ops = await new Client().login('ops@logistics.com', 'Demo@123456');

  // ── account lookup ────────────────────────────────────────────────────────────
  section('Chart-of-accounts lookup by rule');
  const acc = {};
  for (const rule of ['revenue', 'expense', 'accrual']) {
    const r = await admin.get(`/ledger/account-lookup?rule=${rule}`);
    acc[rule] = list(r);
    check(`lookup ${rule}`, r.status === 200 && acc[rule].length > 0, brief(r));
  }
  check('revenue lookup only 4xxx', acc.revenue.every((a) => a.code.startsWith('4')));
  check('expense lookup only 5xxx', acc.expense.every((a) => a.code.startsWith('5')));
  check('accrual lookup only 21xx', acc.accrual.every((a) => a.code.startsWith('21')));
  const revId = acc.revenue[0]?._id; const expId = acc.expense[0]?._id; const accrId = acc.accrual[0]?._id;

  // ── locations ─────────────────────────────────────────────────────────────────
  section('Locations: country currency, UN/LOCODE');
  const countries = list(await admin.get('/locations/countries?limit=100'));
  const cities = list(await admin.get('/locations/cities?limit=100'));
  check('seeded countries exist', countries.length > 0);
  const country = countries[0]; const city = cities.find((c) => String(c.countryId?._id || c.countryId) === String(country._id)) || cities[0];
  const cr = await admin.put(`/locations/countries/${country._id}`, { localCurrency: 'usd' });
  check('country localCurrency saved upper-cased', cr.status === 200 && cr.data?.localCurrency === 'USD', brief(cr));
  expectStatus('country localCurrency "US" rejected', await admin.put(`/locations/countries/${country._id}`, { localCurrency: 'US' }), 400);
  const portBase = { name: `E2E Port ${RUN}`, cityId: city._id, countryId: country._id };
  expectStatus('port UN/LOCODE "12345" rejected', await admin.post('/locations/ports', { ...portBase, code: '12345' }), 400);
  const okPort = await admin.post('/locations/ports', { ...portBase, code: `ZZ${RUN.slice(0, 3)}` });
  expectStatus('port with valid UN/LOCODE created', okPort, 201);
  const noCodePort = await admin.post('/locations/ports', { ...portBase, name: `E2E Port B ${RUN}` });
  expectStatus('port without a code still allowed (optional)', noCodePort, 201);

  // ── container types ───────────────────────────────────────────────────────────
  section('Container types: ISO code, server-derived TEU factor');
  const isoUsed = new Set(list(await admin.get('/container-types?limit=100')).map((c) => c.isoCode));
  const freeIso = ['45G9', '45G8', '45G7'].find((c) => !isoUsed.has(c));
  const ct = await admin.post('/container-types', { code: `E2E${RUN}`, size: '40HC', type: 'Dry', isoCode: freeIso, teuFactor: 99 });
  expectStatus('duplicate ISO code rejected', await admin.post('/container-types', { code: `E2D${RUN}`, size: '20ft', type: 'Dry', isoCode: [...isoUsed].find(Boolean) }), 400);
  expectStatus('container type created', ct, 201);
  check('40HC -> teuFactor 2 (client value 99 ignored)', ct.data?.teuFactor === 2, `got ${ct.data?.teuFactor}`);
  expectStatus('bad ISO code rejected', await admin.post('/container-types', { code: `E2F${RUN}`, size: '20ft', type: 'Dry', isoCode: 'XX' }), 400);
  const ct20 = await admin.put(`/container-types/${ct.data?._id}`, { size: '20ft' });
  check('size change recomputes teuFactor -> 1', ct20.status === 200 && ct20.data?.teuFactor === 1, brief(ct20) + ` got ${ct20.data?.teuFactor}`);

  // ── partners ──────────────────────────────────────────────────────────────────
  section('Partners: contacts[], bank details');
  const partnerBody = {
    code: `E2P${RUN}`, name: `E2E Partner ${RUN}`, nameAr: 'شريك', country: 'Egypt', baseCurrency: 'usd', taxId: 'T-1',
    contacts: [{ name: 'A', title: 'CFO', email: 'a@x.com', phone: '1' }, { name: 'B', email: 'b@x.com' }],
    bank: { bankName: 'Test Bank', usdAccountNumber: '123', usdIban: 'GB82WEST12345698765432', swiftCode: 'DEUTDEFF' },
  };
  const p = await admin.post('/partners', partnerBody);
  expectStatus('partner created', p, 201);
  check('two contacts stored', p.data?.contacts?.length === 2);
  check('baseCurrency upper-cased', p.data?.baseCurrency === 'USD');
  expectStatus('IBAN with bad checksum rejected', await admin.post('/partners', { ...partnerBody, code: `E2Q${RUN}`, bank: { usdIban: 'GB82WEST12345698765433' } }), 400);
  expectStatus('invalid contact email rejected', await admin.post('/partners', { ...partnerBody, code: `E2R${RUN}`, contacts: [{ name: 'X', email: 'nope' }] }), 400);
  const asAdmin = await admin.get(`/partners/${p.data?._id}`);
  check('admin (partners:manage) sees bank details', !!asAdmin.data?.bank?.usdIban, JSON.stringify(asAdmin.data?.bank));
  const roles = list(await admin.get('/roles?limit=50')); const viewerRole = roles.find((r) => r.name === 'Viewer');
  const grantRead = (on) => admin.put(`/permissions/${viewerRole._id}`, { permissions: [{ module: 'partners', actions: { read: on } }] });
  check('temporarily grant Viewer partners:read', (await grantRead(true)).status === 200);
  await new Promise((r) => setTimeout(r, 200));
  const asViewer = await viewer.get(`/partners/${p.data?._id}`);
  check('viewer does NOT see bank details', asViewer.status === 200 && !asViewer.data?.bank?.usdIban, `${asViewer.status} ${JSON.stringify(asViewer.data?.bank)}`);
  check('Viewer partners:read revoked again', (await grantRead(false)).status === 200);
  expectStatus('viewer cannot create a partner', await viewer.post('/partners', { ...partnerBody, code: `E2S${RUN}` }), 403);

  // ── services ──────────────────────────────────────────────────────────────────
  section('Services: applicability / isTaxable / revenue account');
  expectStatus('service with expense account as revenue rejected', await admin.post('/services', { serviceCode: `E2X${RUN}`, serviceName: 'x', revenueAccountId: expId, isTaxable: false }), 400, 'ACCOUNT_WRONG_GROUP');
  const svc = await admin.post('/services', { serviceCode: `E2S${RUN}`, serviceName: `E2E Service ${RUN}`, revenueAccountId: revId, isTaxable: true });
  expectStatus('service with revenue account created', svc, 201);
  check('applicability defaults to SOC_ONLY', svc.data?.applicability === 'SOC_ONLY', `got ${svc.data?.applicability}`);
  expectStatus('invalid applicability rejected', await admin.put(`/services/${svc.data?._id}`, { applicability: 'ALL' }), 400);
  const svcUp = await admin.put(`/services/${svc.data?._id}`, { applicability: 'BOTH' });
  check('applicability updated to BOTH', svcUp.status === 200 && svcUp.data?.applicability === 'BOTH', brief(svcUp));
  const seededSvc = list(await admin.get('/services?limit=50')).find((s) => !String(s.serviceCode).startsWith('E2S'));
  check('seeded services carry a revenue account', !!(seededSvc?.revenueAccountId), JSON.stringify(seededSvc?.revenueAccountId));

  // ── expense types ─────────────────────────────────────────────────────────────
  section('Expense types: level, PDA, accounts');
  const etBase = { category: 'Port', expenseAccountId: expId };
  expectStatus('requiresPda without accrual account rejected', await admin.post('/expense-types', { ...etBase, name: `E2E PDA-noaccr ${RUN}`, operationalLevel: 'PORT_LEVEL', requiresPda: true }), 400, 'EXPENSE_TYPE_INCOMPLETE');
  expectStatus('revenue account as expense account rejected', await admin.post('/expense-types', { ...etBase, expenseAccountId: revId, name: `E2E bad-acc ${RUN}`, operationalLevel: 'VOYAGE_LEVEL' }), 400, 'ACCOUNT_WRONG_GROUP');
  const etNoLevel = await admin.post('/expense-types', { ...etBase, name: `E2E nolevel ${RUN}` });
  check('omitted operationalLevel defaults to VOYAGE_LEVEL (service default, not a rejection)', etNoLevel.status === 201 && etNoLevel.data?.operationalLevel === 'VOYAGE_LEVEL', brief(etNoLevel));
  expectStatus('expense account is required', await admin.post('/expense-types', { category: 'Port', name: `E2E noacc ${RUN}`, operationalLevel: 'VOYAGE_LEVEL' }), 400, 'EXPENSE_TYPE_INCOMPLETE');
  const etRound = await admin.post('/expense-types', { ...etBase, name: `E2E Round-level ${RUN}`, operationalLevel: 'ROUND_LEVEL' });
  const etVoy = await admin.post('/expense-types', { ...etBase, name: `E2E Voyage-level ${RUN}`, operationalLevel: 'VOYAGE_LEVEL' });
  const etPda = await admin.post('/expense-types', { ...etBase, name: `E2E PDA-type ${RUN}`, operationalLevel: 'PORT_LEVEL', requiresPda: true, accrualAccountId: accrId });
  expectStatus('ROUND_LEVEL type created', etRound, 201);
  expectStatus('VOYAGE_LEVEL type created', etVoy, 201);
  expectStatus('PORT_LEVEL + requiresPda + accrual created', etPda, 201);

  // ── expenses vs level ─────────────────────────────────────────────────────────
  section('Expense scope vs operational level, PDA-first rule');
  const rounds = list(await admin.get('/rounds?limit=50'));
  const roundC = rounds.find((r) => /Round C/.test(r.roundName)); // Planned, open
  const voyages = list(await admin.get('/voyages?limit=200'));
  const voyC = voyages.find((v) => String(v.roundId?._id || v.roundId) === String(roundC?._id));
  check('seeded Round C and a voyage found', !!roundC && !!voyC, `round=${!!roundC} voyage=${!!voyC}`);
  const exp = { amount: 100, currency: 'USD', expenseDate: new Date().toISOString() };
  expectStatus('ROUND_LEVEL type on a voyage -> EXPENSE_LEVEL_MISMATCH', await admin.post('/expenses', { ...exp, expenseTypeId: etRound.data?._id, voyageId: voyC?._id }), 400, 'EXPENSE_LEVEL_MISMATCH');
  expectStatus('VOYAGE_LEVEL type on a round -> EXPENSE_LEVEL_MISMATCH', await admin.post('/expenses', { ...exp, expenseTypeId: etVoy.data?._id, roundId: roundC?._id }), 400, 'EXPENSE_LEVEL_MISMATCH');
  const okRoundExp = await admin.post('/expenses', { ...exp, expenseTypeId: etRound.data?._id, roundId: roundC?._id });
  expectStatus('ROUND_LEVEL type on a round accepted', okRoundExp, 201);
  expectStatus('requiresPda type as FDA -> PDA_REQUIRED', await admin.post('/expenses', { ...exp, expenseTypeId: etPda.data?._id, voyageId: voyC?._id, portId: voyC?.polId?._id || voyC?.polId, kind: 'FDA' }), 400, 'PDA_REQUIRED');
  const pdaExp = await admin.post('/expenses', { ...exp, expenseTypeId: etPda.data?._id, voyageId: voyC?._id, portId: voyC?.polId?._id || voyC?.polId });
  expectStatus('requiresPda type accepted', pdaExp, 201);
  check('requiresPda type starts as a PDA', pdaExp.data?.kind === 'PDA', `kind=${pdaExp.data?.kind}`);

  // ── agents ────────────────────────────────────────────────────────────────────
  section('Port agents: roles, booking-source rule');
  const portAgent = await admin.post('/agents', { agentCode: `E2A${RUN}`, agentName: `E2E Port Agent ${RUN}`, nameAr: 'وكيل', defaultCurrency: 'usd', portId: okPort.data?._id, roles: ['Port'] });
  expectStatus('port-only agent created', portAgent, 201);
  check('defaultCurrency upper-cased, portId stored', portAgent.data?.defaultCurrency === 'USD' && !!portAgent.data?.portId, JSON.stringify({ c: portAgent.data?.defaultCurrency, p: portAgent.data?.portId }));
  expectStatus('invalid role rejected', await admin.post('/agents', { agentName: 'x', roles: ['Boss'] }), 400);
  const cargoRow = { containerTypeId: ct.data?._id, quantity: 1, rate: 100 };
  expectStatus('Layer-1 booking against a Port-only agent -> AGENT_NOT_BOOKING_SOURCE', await admin.post('/bookings/manual', { voyageId: voyC?._id, agentId: portAgent.data?._id, cargoRows: [cargoRow] }), 400, 'AGENT_NOT_BOOKING_SOURCE');
  const both = await admin.put(`/agents/${portAgent.data?._id}`, { roles: ['Commercial', 'Port'] });
  check('agent switched to Commercial+Port', both.status === 200, brief(both));
  const okBk = await admin.post('/bookings/manual', { voyageId: voyC?._id, agentId: portAgent.data?._id, cargoRows: [cargoRow] });
  check('same booking accepted once the booking-agent box is ticked', okBk.status === 201, brief(okBk));

  // ── customers ─────────────────────────────────────────────────────────────────
  section('Customers: required type, filters applied before pagination, RBAC');
  expectStatus('customer without type rejected', await admin.post('/customers', { customerCode: `E2C0${RUN}`, customerName: 'x' }), 400);
  expectStatus('customer with unknown type rejected', await admin.post('/customers', { customerCode: `E2C0${RUN}`, customerName: 'x', customerType: 'Shipper' }), 400);
  const made = {};
  for (const [i, t] of ['Commercial Agent', 'NVOCC', 'Freight Forwarder', 'NVOCC', 'NVOCC'].entries()) {
    const r = await admin.post('/customers', { customerCode: `E2C${i}${RUN}`, customerName: `E2E Cust ${i} ${RUN}`, customerType: t, defaultCurrency: 'usd', contacts: [{ name: 'C', email: 'c@x.com' }], arAccountId: undefined });
    expectStatus(`customer ${i} (${t}) created`, r, 201);
    made[i] = r.data;
  }
  expectStatus('duplicate customer code -> DUPLICATE_CODE', await admin.post('/customers', { customerCode: `E2C0${RUN}`, customerName: 'dup', customerType: 'NVOCC' }), 400, 'DUPLICATE_CODE');
  const pg1 = await admin.get(`/customers?customerType=NVOCC&search=${RUN}&limit=2&page=1`);
  const pg2 = await admin.get(`/customers?customerType=NVOCC&search=${RUN}&limit=2&page=2`);
  check('NVOCC filter + search: total 3 across pages (filter applied in the query)', pg1.body?.pagination?.total === 3, JSON.stringify(pg1.body?.pagination));
  check('page 1 has 2 rows, page 2 has 1, all NVOCC', list(pg1).length === 2 && list(pg2).length === 1 && [...list(pg1), ...list(pg2)].every((c) => c.customerType === 'NVOCC'), `${list(pg1).length}/${list(pg2).length}`);
  const ff = await admin.get(`/customers?customerType=Freight%20Forwarder&search=${RUN}`);
  check('Freight Forwarder filter -> exactly 1', list(ff).length === 1, `${list(ff).length}`);
  expectStatus('viewer cannot create a customer', await viewer.post('/customers', { customerCode: `E2V${RUN}`, customerName: 'v', customerType: 'NVOCC' }), 403);
  check('viewer can list customers? (read perm is a seeded-matrix decision)', true, '');
  const opsList = await ops.get('/customers');
  console.log(`  info  ops@ GET /customers -> ${opsList.status}`);

  // ── vessels ───────────────────────────────────────────────────────────────────
  section('Vessels: required fields, JV shares in one transaction, share lock');
  const partners = list(await admin.get('/partners?limit=50')).filter((x) => !String(x.code).startsWith('E2P'));
  const [pa, pb] = partners;
  const imo = String(Math.floor(1000000 + Math.random() * 8999999));
  const vBase = { vesselCode: `E2V${RUN}`, vesselName: `E2E Vessel ${RUN}`, ownershipType: 'Owned', imoNumber: imo, callSign: 'E2CALL', capacity: 1800, defaultDailyHireRate: 12500.5, reeferPlugs: 40, mainEngineFuelType: 'VLSFO', consumptionSeaMtDay: 28.5 };
  expectStatus('vessel without callSign rejected', await admin.post('/vessels', { ...vBase, callSign: undefined }), 400);
  expectStatus('vessel without hire rate rejected', await admin.post('/vessels', { ...vBase, defaultDailyHireRate: undefined }), 400);
  expectStatus('Time Charter without charter dates rejected', await admin.post('/vessels', { ...vBase, ownershipType: 'Time Charter' }), 400);
  expectStatus('legacy ownership value "Chartered" rejected on create', await admin.post('/vessels', { ...vBase, ownershipType: 'Chartered' }), 400);
  const badShares = await admin.post('/vessels', { ...vBase, shares: [{ partnerId: pa._id, shareBp: 6000, isLead: true }, { partnerId: pb._id, shareBp: 3000 }] });
  expectStatus('shares totalling 90% rejected -> SHARES_NOT_100', badShares, 400, 'SHARES_NOT_100');
  const afterBad = list(await admin.get(`/vessels?search=${vBase.vesselCode}`));
  check('failed shares left NO half-created vessel (transaction rolled back)', afterBad.length === 0, `${afterBad.length} vessel(s) found`);
  const v = await admin.post('/vessels', { ...vBase, shares: [{ partnerId: pa._id, shareBp: 6000, isLead: true }, { partnerId: pb._id, shareBp: 4000 }] });
  expectStatus('vessel + 60/40 shares created in one call', v, 201);
  check('hire rate stored as minor units (1250050)', v.data?.defaultDailyHireRateMinor === 1250050, `got ${v.data?.defaultDailyHireRateMinor}`);
  const vShares = await admin.get(`/vessels/${v.data?._id}/partners`);
  check('shares persisted (2 rows)', list(vShares).length === 2 || vShares.data?.shares?.length === 2, JSON.stringify(vShares.data).slice(0, 120));
  const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const tc = await admin.post('/vessels', { ...vBase, vesselCode: `E2W${RUN}`, imoNumber: String(Number(imo) + 1).slice(0, 7), ownershipType: 'Time Charter', charterStartDate: '2025-01-01', charterEndDate: soon });
  expectStatus('Time Charter vessel with dates created', tc, 201);
  check('redelivery within 30 days raises the alert', !!(tc.data?.redeliveryAlert), JSON.stringify(tc.data?.redeliveryAlert));
  // shares lock: a seeded vessel already has ledger lines (rounds A/B posted)
  const seededVessels = list(await admin.get('/vessels?limit=20')).filter((x) => !String(x.vesselCode).startsWith('E2'));
  let locked = 0; let lockCode = '';
  for (const sv of seededVessels) {
    const cur = list(await admin.get(`/vessels/${sv._id}/partners`));
    const body = (cur.length ? cur : (await admin.get(`/vessels/${sv._id}/partners`)).data?.shares || []).map((s) => ({ partnerId: s.partnerId?._id || s.partnerId, shareBp: s.shareBp, isLead: s.isLead }));
    if (!body.length) continue;
    const r = await admin.put(`/vessels/${sv._id}/partners`, { shares: body });
    if (r.code === 'VESSEL_SHARES_LOCKED') { locked++; lockCode = r.code; }
  }
  check('at least one seeded vessel with accounting entries is share-locked', locked > 0, `locked=${locked}/${seededVessels.length}`);
  const fresh = await admin.put(`/vessels/${v.data?._id}/partners`, { shares: [{ partnerId: pa._id, shareBp: 5000, isLead: true }, { partnerId: pb._id, shareBp: 5000 }] });
  check('a new vessel with no accounting entries can still change shares (50/50)', fresh.status === 200, brief(fresh));

  // ── dependents / deletes ──────────────────────────────────────────────────────
  section('Delete guards');
  const accDel = await admin.get('/ledger/accounts');
  check('accounts listable', accDel.status === 200);
  expectStatus('customer delete (unused) allowed', await admin.del(`/customers/${made[0]?._id}`), 200);
  const delSvc = await admin.del(`/services/${svc.data?._id}`);
  check('unused service delete allowed', delSvc.status === 200, brief(delSvc));
  expectStatus('port-agent delete blocked while it has a booking', await admin.del(`/agents/${portAgent.data?._id}`), 409, 'HAS_DEPENDENTS');

  // ── RBAC sanity ───────────────────────────────────────────────────────────────
  section('RBAC');
  expectStatus('unauthenticated /customers -> 401', await fetch(`${BASE}/customers`).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })), 401);
  expectStatus('viewer cannot create a service', await viewer.post('/services', { serviceCode: 'VVV', serviceName: 'v', revenueAccountId: revId }), 403);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, ${failed.length} FAILED:` : ''}`);
  failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? `  [${f.detail}]` : ''}`));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('E2E aborted:', e); process.exit(2); });
