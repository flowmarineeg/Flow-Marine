'use strict';

// S-03 probe: deleteCountry / deleteCity / deleteTerminal must refuse (409 HAS_DEPENDENTS, with counts) while an agent,
// tracking record, round snapshot or route leg still points to the location, and succeed once the references are gone.
// Run against the dev server + the disposable TEST database:  node scripts/audit-probes/location-delete-probe.js
// Prints only, writes no file. Fixtures: one temporary country + city + terminal (created through the API) and a few
// minimal documents written straight to the collections to act as the references. ALL are removed in `finally`.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5000/api/v1';
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`); };
const note = (m) => console.log(`  info  ${m}`);

class Client {
  async login(email, password) {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (r.status !== 200) return null;
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
    return { status: r.status, body: json, data: json?.data, message: json?.message };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b ?? {}); }
  del(u) { return this.req('DELETE', u); }
}

(async () => {
  const health = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
  if (!health) { console.error(`Server not reachable at ${BASE} - start it with npm run dev`); process.exit(2); }
  const admin = await new Client().login(process.env.ADMIN_EMAIL || 'admin@logistics.com', process.env.ADMIN_PASSWORD || 'Admin@123456');
  if (!admin) { console.error('admin login failed'); process.exit(2); }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const oid = (s) => new mongoose.Types.ObjectId(String(s));
  console.log(`Location delete probe on database "${db.databaseName}" (${BASE})`);

  const made = { country: null, city: null, terminal: null, port: null }; const docs = []; // docs = [collection, _id]
  const putDoc = async (coll, doc) => { const r = await db.collection(coll).insertOne(doc); docs.push([coll, r.insertedId]); return r.insertedId; };
  const dropDocs = async () => { for (const [c, id] of docs.splice(0)) await db.collection(c).deleteOne({ _id: id }); };

  try {
    // ── fixtures through the API ────────────────────────────────────────────
    const stamp = String(Date.now()).slice(-6);
    const country = await admin.post('/locations/countries', { name: `ZZ Probe Land ${stamp}`, code: 'QZ' });
    if (country.status !== 201) { note(`SKIP: temp country not created (${country.status} ${country.message}); is a QZ country left over?`); return; }
    made.country = country.data._id;
    const city = await admin.post('/locations/cities', { name: `ZZ Probe City ${stamp}`, countryId: made.country });
    check('temp city created', city.status === 201, `${city.status} ${city.message}`);
    made.city = city.data?._id;
    const anyPort = (await admin.get('/locations/ports?limit=1')).data?.[0];
    const term = await admin.post('/locations/terminals', { name: `ZZ Probe Terminal ${stamp}`, portId: anyPort?._id });
    check('temp terminal created', term.status === 201, `${term.status} ${term.message}`);
    made.terminal = term.data?._id;
    if (!made.city || !made.terminal) return;

    const c = oid(made.country); const ci = oid(made.city); const t = oid(made.terminal);

    // ── country: city child, then each kind of reference ───────────────────
    const r0 = await admin.del(`/locations/countries/${made.country}`);
    check('country with a city under it -> 400 and the message names the city count', r0.status === 400 && /1 cit/.test(r0.message || ''), `${r0.status} ${r0.message}`);

    const agentId = await putDoc('agents', { agentName: `ZZ probe agent ${stamp}`, countryId: c, cityId: ci });
    const trackId = await putDoc('trackinghistories', { countryId: c, cityId: ci, terminalId: t });
    const roundId = await putDoc('rounds', { roundName: `ZZ probe round ${stamp}`, routeSnapshot: { legs: [{ countryId: c, cityId: ci, terminalId: t }] } });
    const legId = await putDoc('routelegs', { countryId: c, cityId: ci, terminalId: t });

    // city: blocked by agent / tracking / round snapshot / route leg, with counts
    const rc = await admin.del(`/locations/cities/${made.city}`);
    check('city referenced by agent, tracking, round snapshot and route leg -> 409 HAS_DEPENDENTS', rc.status === 409 && rc.body?.code === 'HAS_DEPENDENTS', `${rc.status} ${rc.message}`);
    check('  the message shows the counts (vessels/agents, tracking entries, rounds, route legs)', /1 route legs/.test(rc.message) && /1 vessels\/agents/.test(rc.message) && /1 tracking entries/.test(rc.message) && /1 rounds/.test(rc.message), rc.message);
    // terminal
    const rt = await admin.del(`/locations/terminals/${made.terminal}`);
    check('terminal referenced by route leg, tracking and round snapshot -> 409 HAS_DEPENDENTS with counts', rt.status === 409 && rt.body?.code === 'HAS_DEPENDENTS' && /1 route legs/.test(rt.message) && /1 tracking entries/.test(rt.message) && /1 rounds/.test(rt.message), `${rt.status} ${rt.message}`);
    check('nothing was deleted by the refused calls', !!(await db.collection('cities').findOne({ _id: ci })) && !!(await db.collection('terminals').findOne({ _id: t })) && !!(await db.collection('countries').findOne({ _id: c })));

    // one reference at a time: remove them and watch the block shrink
    await db.collection('routelegs').deleteOne({ _id: legId });
    const rc2 = await admin.del(`/locations/cities/${made.city}`);
    check('city: still blocked after the route leg is gone, route legs no longer listed', rc2.status === 409 && !/route legs/.test(rc2.message) && /agents/.test(rc2.message), rc2.message);
    await db.collection('rounds').deleteOne({ _id: roundId });
    await db.collection('trackinghistories').deleteOne({ _id: trackId });
    const rt2 = await admin.del(`/locations/terminals/${made.terminal}`);
    check('terminal: with no references left it can be deleted (200)', rt2.status === 200, `${rt2.status} ${rt2.message}`);
    check('terminal is gone', !(await db.collection('terminals').findOne({ _id: t })));
    made.terminal = null;

    // country: the agent still references country + city; the city is a child
    const rcy = await admin.del(`/locations/cities/${made.city}`);
    check('city: still blocked by the agent only', rcy.status === 409 && /1 vessels\/agents/.test(rcy.message) && !/tracking|rounds|route legs/.test(rcy.message), rcy.message);
    await db.collection('agents').deleteOne({ _id: agentId });
    const rcy2 = await admin.del(`/locations/cities/${made.city}`);
    check('city: with no references left it can be deleted (200)', rcy2.status === 200, `${rcy2.status} ${rcy2.message}`);
    made.city = null;

    // country referenced by an agent / tracking record / round snapshot / route leg (city already gone)
    const a2 = await putDoc('agents', { agentName: `ZZ probe agent2 ${stamp}`, countryId: c });
    const t2 = await putDoc('trackinghistories', { countryId: c });
    const r2 = await putDoc('rounds', { roundName: `ZZ probe round2 ${stamp}`, routeSnapshot: { legs: [{ countryId: c }] } });
    const l2 = await putDoc('routelegs', { countryId: c });
    const rco = await admin.del(`/locations/countries/${made.country}`);
    check('country referenced by agent, tracking, round snapshot and route leg -> 409 HAS_DEPENDENTS with counts', rco.status === 409 && rco.body?.code === 'HAS_DEPENDENTS' && /1 route legs/.test(rco.message) && /1 vessels\/agents/.test(rco.message) && /1 tracking entries/.test(rco.message) && /1 rounds/.test(rco.message), `${rco.status} ${rco.message}`);
    for (const [coll, id] of [['agents', a2], ['trackinghistories', t2], ['rounds', r2], ['routelegs', l2]]) await db.collection(coll).deleteOne({ _id: id });
    const rco2 = await admin.del(`/locations/countries/${made.country}`);
    check('country: with no references left it can be deleted (200)', rco2.status === 200, `${rco2.status} ${rco2.message}`);
    made.country = null;
    check('unknown ids still give 404', (await admin.del('/locations/countries/000000000000000000000000')).status === 404 && (await admin.del('/locations/cities/000000000000000000000000')).status === 404 && (await admin.del('/locations/terminals/000000000000000000000000')).status === 404);
  } finally {
    await dropDocs();
    // leftovers if a check above aborted: remove through the API (children first)
    if (made.terminal) await admin.del(`/locations/terminals/${made.terminal}`);
    if (made.city) await admin.del(`/locations/cities/${made.city}`);
    if (made.country) await admin.del(`/locations/countries/${made.country}`);
    const left = (await db.collection('countries').countDocuments({ name: /^ZZ Probe Land/ })) + (await db.collection('cities').countDocuments({ name: /^ZZ Probe City/ })) + (await db.collection('terminals').countDocuments({ name: /^ZZ Probe Terminal/ }));
    check('all fixtures removed (no ZZ Probe country / city / terminal left)', left === 0, String(left));
    await mongoose.disconnect();
  }
  const bad = results.filter((r) => !r).length;
  console.log(`\n${results.length} checks, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('probe aborted:', e.stack || e.message); process.exit(1); });
