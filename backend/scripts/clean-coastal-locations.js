'use strict';

// Locations cleanup: only sea / coastal locations stay (owner request 2026-11-19, prompt.txt).
//   node scripts/clean-coastal-locations.js [--out report.md]
// Dry run is the DEFAULT (read-only). --apply deletes bottom-up in one transaction after writing a backup file;
// on a non-test DB it also needs --allow-production --confirm-db <name>.
//
// Rules (owner-approved):
//   - landlocked countries (44, coastal.logic.js) and everything under them are removal candidates;
//     anything referenced by another record is BLOCKED (listed with its references), never removed.
//   - cities of coastal countries: KEEP if they hold a port/terminal or are referenced; the rest are listed
//     (FLAG, not deleted) grouped by country for a second pass with a distance-to-coast check.
//   - ports: kept; flagged for review when probe leftovers, river/estuary, non-sea name, suspect LOCODE.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { DEPENDENTS } = require('../src/utils/dependents');
const { isLandlockedCountry, portReviewFlags } = require('../src/modules/locations/coastal.logic');

const Country = require('../src/modules/locations/country.model');
const City = require('../src/modules/locations/city.model');
const Port = require('../src/modules/locations/port.model');
const Terminal = require('../src/modules/locations/terminal.model');
// register every model that references locations so the dependents scan sees them
['routes/routeLeg', 'agents/agent', 'tracking/trackingHistory', 'expenses/expense', 'voyages/voyage', 'rounds/round',
  'bookings/booking', 'bookings/manualBooking'].forEach((m) => require(`../src/modules/${m}.model`));

const argv = process.argv.slice(2);
const flagVal = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const OUT = flagVal('--out');
// Dry run is the default. Deleting needs --apply. On any DB other than `test` (or NODE_ENV=production) it also needs
// --allow-production AND --confirm-db <exact db name>.
const APPLY = argv.includes('--apply');
const ALLOW_PROD = argv.includes('--allow-production');
const CONFIRM_DB = flagVal('--confirm-db');
const TEST_DB_NAME = 'test';

const assertMayApply = (dbName) => {
  const prodLike = dbName !== TEST_DB_NAME || process.env.NODE_ENV === 'production';
  if (!prodLike) return;
  if (!ALLOW_PROD || CONFIRM_DB !== dbName) {
    console.error(`Refused: database "${dbName}" is not the TEST database. To delete here pass --allow-production --confirm-db ${dbName}.`);
    process.exit(3);
  }
};

/** Map<idString, [{label,count}]> of references per spec list, computed with one aggregate per spec (not per id). */
const referenceMap = async (specs) => {
  const map = new Map();
  for (const s of specs) {
    let Model;
    try { Model = mongoose.model(s.model); } catch { continue; }
    const parts = s.field.split('.');
    const pipeline = [];
    if (s.filter) pipeline.push({ $match: s.filter });
    if (parts.length > 1) pipeline.push({ $unwind: { path: `$${parts.slice(0, -1).join('.')}`, preserveNullAndEmptyArrays: true } });
    pipeline.push({ $match: { [s.field]: { $ne: null } } });
    pipeline.push({ $group: { _id: `$${s.field}`, docs: { $addToSet: '$_id' } } });
    for (const g of await Model.aggregate(pipeline)) {
      const key = String(g._id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ label: s.label, count: g.docs.length });
    }
  }
  return map;
};
const fmtRefs = (refs) => (refs && refs.length ? refs.map((r) => `${r.count} ${r.label}`).join(', ') : '');
const countBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());

const run = async () => {
  const [countries, cities, ports, terminals] = await Promise.all([
    Country.find({}).lean(), City.find({}).lean(), Port.find({}).lean(), Terminal.find({}).lean(),
  ]);
  const refs = {
    country: await referenceMap(DEPENDENTS.country),
    city: await referenceMap(DEPENDENTS.city),
    // port refs from other records only; Terminal/RouteLeg children are handled by the hierarchy below
    port: await referenceMap(DEPENDENTS.port),
    terminal: await referenceMap(DEPENDENTS.terminal),
  };
  const portsByCity = countBy(ports, (p) => String(p.cityId));
  const terminalsByPort = countBy(terminals, (t) => String(t.portId));
  const cityById = new Map(cities.map((c) => [String(c._id), c]));
  const countryById = new Map(countries.map((c) => [String(c._id), c]));
  const portById = new Map(ports.map((p) => [String(p._id), p]));
  const R = (kind, doc) => refs[kind].get(String(doc._id)) || [];

  // ── classify ───────────────────────────────────────────────────────────────
  const res = { country: [], city: [], port: [], terminal: [] };
  const landlockedIds = new Set(countries.filter((c) => isLandlockedCountry(c.code)).map((c) => String(c._id)));

  for (const t of terminals) {
    const port = portById.get(String(t.portId));
    const city = port && cityById.get(String(port.cityId));
    const llk = city && landlockedIds.has(String(city.countryId));
    const r = R('terminal', t);
    res.terminal.push({ doc: t, status: llk ? (r.length ? 'BLOCKED' : 'REMOVE') : 'KEEP', refs: r, note: port ? `port ${port.name}` : 'orphan: port missing' });
  }
  for (const p of ports) {
    const llk = landlockedIds.has(String(p.countryId));
    const r = R('port', p);
    const kids = terminalsByPort.get(String(p._id)) || 0;
    const flags = portReviewFlags(p);
    let status = 'KEEP';
    if (llk) status = (r.length || kids) ? 'BLOCKED' : 'REMOVE';
    else if (flags.length) status = 'FLAG';
    res.port.push({ doc: p, status, refs: r, kids, flags, note: `${(cityById.get(String(p.cityId)) || {}).name || '?'}, ${(countryById.get(String(p.countryId)) || {}).code || '?'}` });
  }
  const probeOnlyCity = new Set();
  for (const c of cities) {
    const llk = landlockedIds.has(String(c.countryId));
    const r = R('city', c);
    const nPorts = portsByCity.get(String(c._id)) || 0;
    let status; let note = '';
    if (llk) status = (r.length || nPorts) ? 'BLOCKED' : 'REMOVE';
    else if (nPorts || r.length) {
      status = 'KEEP';
      const own = ports.filter((p) => String(p.cityId) === String(c._id));
      if (own.length && own.every((p) => /probe leftover/.test(portReviewFlags(p).join()))) { status = 'FLAG'; note = 'holds only probe-leftover ports'; probeOnlyCity.add(String(c._id)); }
    } else { status = 'FLAG'; note = 'no port/terminal, no reference: coastal status unverified (second pass)'; }
    res.city.push({ doc: c, status, refs: r, kids: nPorts, note });
  }
  for (const c of countries) {
    const llk = landlockedIds.has(String(c._id));
    const r = R('country', c);
    const nCities = cities.filter((x) => String(x.countryId) === String(c._id)).length;
    const nPorts = ports.filter((x) => String(x.countryId) === String(c._id)).length;
    let status = 'KEEP';
    if (llk) status = (r.length || nCities || nPorts) ? 'BLOCKED' : 'REMOVE';
    res.country.push({ doc: c, status, refs: r, kids: nCities + nPorts, note: llk ? 'landlocked' : '' });
  }

  // ── report ─────────────────────────────────────────────────────────────────
  const count = (lvl, st) => res[lvl].filter((x) => x.status === st).length;
  const L = [];
  L.push(`# Coastal locations cleanup - DRY RUN report`, '', `Database: \`${mongoose.connection.name}\` | generated ${new Date().toISOString()} | nothing was changed`, '');
  L.push('## Counts', '', '| Level | Total | Keep | Remove | Flag (kept, review) | Blocked |', '|---|---|---|---|---|---|');
  for (const lvl of ['country', 'city', 'port', 'terminal']) {
    L.push(`| ${lvl} | ${res[lvl].length} | ${count(lvl, 'KEEP')} | ${count(lvl, 'REMOVE')} | ${count(lvl, 'FLAG')} | ${count(lvl, 'BLOCKED')} |`);
  }
  const list = (lvl, st, fmt) => res[lvl].filter((x) => x.status === st).map(fmt);
  const cname = (id) => (countryById.get(String(id)) || {}).code || '?';
  L.push('', '## Would be removed (nothing references them)', '');
  for (const lvl of ['terminal', 'port', 'city', 'country']) {
    const rows = list(lvl, 'REMOVE', (x) => `${x.doc.name} ${lvl === 'country' ? `(${x.doc.code})` : ''}`);
    L.push(`### ${lvl === 'city' ? 'cities' : lvl === 'country' ? 'countries' : `${lvl}s`} (${rows.length})`, rows.length ? rows.join(', ') : '_none_', '');
  }
  L.push('## Blocked (landlocked but referenced or has children) - owner decides', '');
  const blocked = [];
  for (const lvl of ['country', 'city', 'port', 'terminal']) {
    for (const x of res[lvl].filter((y) => y.status === 'BLOCKED')) blocked.push(`- ${lvl} **${x.doc.name}**: ${fmtRefs(x.refs) || 'no external refs'}${x.kids ? `; ${x.kids} child record(s)` : ''}`);
  }
  L.push(blocked.length ? blocked.join('\n') : '_none_', '');
  L.push('## Flagged ports (kept, review)', '');
  const pf = res.port.filter((x) => x.status === 'FLAG');
  L.push(...(pf.length ? pf.map((x) => `- **${x.doc.name}** [${x.doc.code || 'no code'}] (${x.note}): ${x.flags.join('; ')}; referenced by ${fmtRefs(x.refs) || 'nothing'}`) : ['_none_']), '');
  L.push('## Landlocked countries in the DB (all would be removed, 0 cities/ports under them)', '');
  L.push(res.country.filter((x) => x.note === 'landlocked').map((x) => `${x.doc.code} ${x.doc.name} [${x.status}]`).join(', '), '');
  L.push('## Cities kept because they hold a port/terminal or are referenced', '');
  const kept = res.city.filter((x) => x.status === 'KEEP' || probeOnlyCity.has(String(x.doc._id)));
  L.push(...kept.map((x) => `- ${x.doc.name} (${cname(x.doc.countryId)}): ${x.kids} port(s)${x.refs.length ? `, ${fmtRefs(x.refs)}` : ''}${x.note ? ` - ${x.note}` : ''}`), '');
  L.push('## Cities with no port and no reference (FLAG, NOT deleted - second pass) grouped by country', '');
  const byCountry = new Map();
  for (const x of res.city.filter((y) => y.status === 'FLAG' && !probeOnlyCity.has(String(y.doc._id)))) {
    const k = cname(x.doc.countryId);
    if (!byCountry.has(k)) byCountry.set(k, []);
    byCountry.get(k).push(x.doc.name);
  }
  for (const [k, names] of [...byCountry].sort((a, b) => b[1].length - a[1].length)) {
    L.push(`### ${k} - ${names.length} cities`, names.sort().join('; '), '');
  }
  const refsOnlyChild = res.port.filter((x) => x.refs.length).length;
  L.push('## Reference counts of kept ports (how much depends on them)', '');
  L.push(...res.port.filter((x) => x.refs.length).map((x) => `- ${x.doc.name}: ${fmtRefs(x.refs)}`), '', `(${refsOnlyChild} of ${res.port.length} ports are referenced)`, '');
  L.push('## Not verified', '', '- Coastal status of the cities in coastal countries (no data in repo; second pass).', '- DB is the Atlas TEST database; a production DB may hold other records.', '- Reference scan is code-derived (models in DEPENDENTS); a collection not listed there is not scanned.');

  const text = L.join('\n');
  if (OUT) fs.writeFileSync(OUT, text, 'utf8');
  const flagCities = res.city.filter((x) => x.status === 'FLAG').length;
  console.log(`DB ${mongoose.connection.name} - ${APPLY ? 'APPLY (classification before delete)' : 'DRY RUN, nothing changed'}`);
  for (const lvl of ['country', 'city', 'port', 'terminal']) console.log(`${lvl.padEnd(9)} total ${res[lvl].length} | keep ${count(lvl, 'KEEP')} | remove ${count(lvl, 'REMOVE')} | flag ${count(lvl, 'FLAG')} | blocked ${count(lvl, 'BLOCKED')}`);
  console.log(`flagged cities in ${byCountry.size} countries (${flagCities} cities incl. probe parents)`);
  if (OUT) console.log(`full report: ${OUT}`);
  else console.log(text.split('\n').slice(0, 60).join('\n'));

  if (APPLY) await applyRemovals(res);
};

const { countDependents } = require('../src/utils/dependents');
const DEP_KEY = { terminal: 'terminal', port: 'port', city: 'city', country: 'country' };

/** Children that must be gone (or removed in the same run) before a record can go. */
const childCount = async (lvl, id, session) => {
  if (lvl === 'country') return (await City.countDocuments({ countryId: id }).session(session)) + (await Port.countDocuments({ countryId: id }).session(session));
  if (lvl === 'city') return Port.countDocuments({ cityId: id }).session(session);
  if (lvl === 'port') return Terminal.countDocuments({ portId: id }).session(session);
  return 0;
};

const applyRemovals = async (res) => {
  const dbName = mongoose.connection.name;
  assertMayApply(dbName);
  const plan = {
    terminal: res.terminal.filter((x) => x.status === 'REMOVE'), port: res.port.filter((x) => x.status === 'REMOVE'),
    city: res.city.filter((x) => x.status === 'REMOVE'), country: res.country.filter((x) => x.status === 'REMOVE'),
  };
  const total = Object.values(plan).reduce((n, a) => n + a.length, 0);
  const summary = { removed: { terminal: 0, port: 0, city: 0, country: 0 }, blocked: [], kept: 0, flagged: 0 };
  summary.kept = ['country', 'city', 'port', 'terminal'].reduce((n, l) => n + res[l].filter((x) => x.status === 'KEEP').length, 0);
  summary.flagged = ['country', 'city', 'port', 'terminal'].reduce((n, l) => n + res[l].filter((x) => x.status === 'FLAG').length, 0);
  for (const l of Object.keys(res)) for (const x of res[l].filter((y) => y.status === 'BLOCKED')) summary.blocked.push(`${l} ${x.doc.name}`);

  if (total === 0) { console.log('Nothing to remove (re-run safe).'); return printSummary(summary); }

  // backup first: raw export of the four location collections, written before any delete
  const dir = require('path').join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = require('path').join(dir, `locations-${dbName}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const [countries, cities, ports, terminals] = await Promise.all([Country.find({}).lean(), City.find({}).lean(), Port.find({}).lean(), Terminal.find({}).lean()]);
  fs.writeFileSync(file, JSON.stringify({ db: dbName, at: new Date().toISOString(), countries, cities, ports, terminals }), 'utf8');
  console.log(`backup written: ${file} (${countries.length} countries, ${cities.length} cities, ${ports.length} ports, ${terminals.length} terminals)`);

  const models = { terminal: Terminal, port: Port, city: City, country: Country };
  // bottom-up, one transaction; every record is re-checked INSIDE the transaction (references + children)
  await mongoose.connection.transaction(async (session) => {
    for (const lvl of ['terminal', 'port', 'city', 'country']) {
      for (const x of plan[lvl]) {
        const refs = await countDependents(x.doc._id, DEPENDENTS[DEP_KEY[lvl]], { session });
        const kids = await childCount(lvl, x.doc._id, session);
        if (refs.length || kids) { summary.blocked.push(`${lvl} ${x.doc.name} (changed since the dry run: ${fmtRefs(refs)}${kids ? `, ${kids} children` : ''})`); continue; }
        await models[lvl].deleteOne({ _id: x.doc._id }, { session });
        summary.removed[lvl] += 1;
      }
    }
  });
  printSummary(summary);
};

const printSummary = (s) => {
  console.log('SUMMARY', JSON.stringify({ removed: s.removed, kept: s.kept, flagged: s.flagged, blocked: s.blocked.length }));
  if (s.blocked.length) console.log('blocked:\n - ' + s.blocked.join('\n - '));
};

connectDB().then(run).then(() => process.exit(0)).catch((e) => { console.error(e.stack || e.message); process.exit(1); });
