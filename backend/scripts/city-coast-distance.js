'use strict';

// ONE-OFF, READ-ONLY. Second pass of the coastal-locations cleanup (owner brief 2026-11-19).
// For every city that has no port and is not referenced by anything (route leg, agent, tracking, round snapshot),
// compute the distance from its lat/long to the nearest coastline (Natural Earth 10m, passed as a GeoJSON file) and
// write a report. It never writes to the database and is NOT used at runtime. Needs no new dependency: the lat/long
// come from the existing `country-state-city` package (matched by country ISO code + city name, same rule as
// seed-locations), the coastline from a file you download once.
//   node scripts/city-coast-distance.js --coast <ne_10m_coastline.geojson> --out <report.md>
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const mongoose = require('mongoose');
const { Country: LibCountry, City: LibCity } = require('country-state-city');
const connectDB = require('../src/config/db');
const { DEPENDENTS } = require('../src/utils/dependents');
const Country = require('../src/modules/locations/country.model');
const City = require('../src/modules/locations/city.model');
const Port = require('../src/modules/locations/port.model');
['routes/routeLeg', 'agents/agent', 'tracking/trackingHistory', 'rounds/round'].forEach((m) => require(`../src/modules/${m}.model`));

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const COAST = val('--coast');
const OUT = val('--out');
if (!COAST || !OUT) { console.error('usage: node scripts/city-coast-distance.js --coast <geojson> --out <report.md>'); process.exit(2); }

const CUTOFFS = [25, 50, 100];
const MAIN = 50;
const R_EARTH = 6371.0088;
const DEG = Math.PI / 180;

// ── coastline index: segments bucketed in 1-degree cells ───────────────────────
const buildIndex = (geojson) => {
  const segs = []; // [lon1, lat1, lon2, lat2]
  const add = (line) => { for (let i = 1; i < line.length; i += 1) segs.push([line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]]); };
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'LineString') add(g.coordinates);
    else if (g.type === 'MultiLineString') g.coordinates.forEach(add);
  }
  const cells = new Map();
  const key = (x, y) => `${x},${y}`;
  segs.forEach((s, idx) => {
    const x0 = Math.floor(Math.min(s[0], s[2])); const x1 = Math.floor(Math.max(s[0], s[2]));
    const y0 = Math.floor(Math.min(s[1], s[3])); const y1 = Math.floor(Math.max(s[1], s[3]));
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) { const k = key(x, y); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(idx); }
  });
  return { segs, cells, key };
};

/** Distance in km from a point to a segment, local equirectangular projection around the point (fine below ~300 km). */
const distSegKm = (lon, lat, s) => {
  const kx = Math.cos(lat * DEG) * R_EARTH * DEG; const ky = R_EARTH * DEG;
  const ax = (s[0] - lon) * kx; const ay = (s[1] - lat) * ky;
  const bx = (s[2] - lon) * kx; const by = (s[3] - lat) * ky;
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
};

const SEARCH_KM = 220; // beyond this a city is just ">200 km"
const distanceToCoast = (idx, lon, lat) => {
  const ry = Math.ceil(SEARCH_KM / 111);
  const rx = Math.min(30, Math.ceil(SEARCH_KM / (111 * Math.max(0.15, Math.cos(lat * DEG)))));
  const seen = new Set(); let best = Infinity;
  const cx = Math.floor(lon); const cy = Math.floor(lat);
  for (let x = cx - rx; x <= cx + rx; x += 1) for (let y = cy - ry; y <= cy + ry; y += 1) {
    const list = idx.cells.get(idx.key(x, y));
    if (!list) continue;
    for (const i of list) { if (seen.has(i)) continue; seen.add(i); const d = distSegKm(lon, lat, idx.segs[i]); if (d < best) best = d; }
  }
  // the search box guarantees every segment within SEARCH_KM; beyond 200 km a value is not reliable, so it is just ">200"
  return best > 200 ? null : best;
};

// ── DB: candidate cities (no port, no reference) ───────────────────────────────
const referencedCityIds = async () => {
  const ids = new Set();
  for (const s of DEPENDENTS.city) {
    let Model; try { Model = mongoose.model(s.model); } catch { continue; }
    const parts = s.field.split('.');
    const pipeline = [];
    if (parts.length > 1) pipeline.push({ $unwind: { path: `$${parts.slice(0, -1).join('.')}`, preserveNullAndEmptyArrays: true } });
    pipeline.push({ $match: { [s.field]: { $ne: null } } }, { $group: { _id: `$${s.field}` } });
    for (const g of await Model.aggregate(pipeline)) ids.add(String(g._id));
  }
  return ids;
};

const lc = (s) => String(s || '').trim().toLowerCase();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

const run = async () => {
  const t0 = Date.now();
  const idx = buildIndex(JSON.parse(fs.readFileSync(COAST, 'utf8')));
  console.log(`coastline: ${idx.segs.length} segments, ${idx.cells.size} grid cells`);

  const [countries, cities, ports] = await Promise.all([Country.find({}).lean(), City.find({}).lean(), Port.find({}).select('cityId').lean()]);
  const withPort = new Set(ports.map((p) => String(p.cityId)));
  const referenced = await referencedCityIds();
  const cById = new Map(countries.map((c) => [String(c._id), c]));
  const protectedCount = { port: 0, ref: 0 };
  const cand = [];
  for (const c of cities) {
    if (withPort.has(String(c._id))) { protectedCount.port += 1; continue; }
    if (referenced.has(String(c._id))) { protectedCount.ref += 1; continue; }
    cand.push(c);
  }
  console.log(`cities ${cities.length}: ${protectedCount.port} hold a port, ${protectedCount.ref} referenced (protected), ${cand.length} candidates`);

  // lat/long by country: first library city per lower-cased name (same rule as seed-locations)
  const libCoords = new Map();
  const coordsOf = (iso) => {
    if (libCoords.has(iso)) return libCoords.get(iso);
    const m = new Map();
    for (const lc2 of LibCity.getCitiesOfCountry(iso) || []) {
      const k = lc(lc2.name);
      if (!k || m.has(k)) continue;
      m.set(k, [num(lc2.longitude), num(lc2.latitude)]);
    }
    libCoords.set(iso, m); return m;
  };

  const byCountry = new Map();
  for (const c of cand) {
    const co = cById.get(String(c.countryId));
    const code = co ? co.code : '??';
    if (!byCountry.has(code)) byCountry.set(code, { name: co ? co.name : '?', rows: [], unknown: [] });
    const g = byCountry.get(code);
    const ll = coordsOf(code).get(lc(c.name));
    const [lon, lat] = ll || [null, null];
    if (lon === null || lat === null || (lon === 0 && lat === 0) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { g.unknown.push(c.name); continue; }
    g.rows.push({ name: c.name, km: distanceToCoast(idx, lon, lat) });
  }

  // ── report ───────────────────────────────────────────────────────────────────
  const kmOr = (r) => (r.km === null ? 9999 : r.km);
  const fmt = (r) => (r.km === null ? `${r.name} (>200)` : `${r.name} (${r.km < 10 ? r.km.toFixed(1) : Math.round(r.km)})`);
  const tot = { n: 0, unknown: 0, within: { 25: 0, 50: 0, 100: 0 } };
  const L = [];
  const rowsOut = [...byCountry.entries()].sort((a, b) => (b[1].rows.length + b[1].unknown.length) - (a[1].rows.length + a[1].unknown.length));
  for (const [, g] of rowsOut) {
    tot.n += g.rows.length + g.unknown.length; tot.unknown += g.unknown.length;
    for (const k of CUTOFFS) tot.within[k] += g.rows.filter((r) => kmOr(r) <= k).length;
  }
  L.push('# Second pass - distance of flagged cities to the coast (REPORT ONLY, nothing deleted)', '');
  L.push(`Database \`${mongoose.connection.name}\` | coastline: Natural Earth 10m coastline (${idx.segs.length} segments) | generated ${new Date().toISOString()}`, '');
  L.push('Candidates = cities with **no port and no reference** (route leg, agent, tracking, round snapshot). Cities that hold a port or are referenced are protected and not in this report '
    + `(${protectedCount.port} hold a port, ${protectedCount.ref} are referenced).`);
  L.push('Distance = straight line from the city lat/long (country-state-city package) to the nearest coastline segment, km. `(>200)` = farther than the search radius.', '');
  L.push('## Choose the cutoff', '', '| Cutoff | Candidate keep (within) | Candidate remove (beyond) | Unknown (no lat/long) |', '|---|---|---|---|');
  for (const k of CUTOFFS) L.push(`| ${k} km${k === MAIN ? ' (main lists below)' : ''} | ${tot.within[k]} | ${tot.n - tot.unknown - tot.within[k]} | ${tot.unknown} |`);
  L.push('', `Total candidates: ${tot.n}`, '', '## Per country counts', '', '| Country | Candidates | <=25 km | <=50 km | <=100 km | >100 km | Unknown |', '|---|---|---|---|---|---|---|');
  for (const [code, g] of rowsOut) {
    const w = (k) => g.rows.filter((r) => kmOr(r) <= k).length;
    L.push(`| ${code} ${g.name} | ${g.rows.length + g.unknown.length} | ${w(25)} | ${w(50)} | ${w(100)} | ${g.rows.length - w(100)} | ${g.unknown.length} |`);
  }
  L.push('', `## Per country lists (cutoff ${MAIN} km; name (km to coast))`, '');
  for (const [code, g] of rowsOut) {
    const keep = g.rows.filter((r) => kmOr(r) <= MAIN).sort((a, b) => kmOr(a) - kmOr(b));
    const drop = g.rows.filter((r) => kmOr(r) > MAIN).sort((a, b) => kmOr(a) - kmOr(b));
    L.push(`### ${code} ${g.name}`, '', `**Candidate keep (<= ${MAIN} km): ${keep.length}**`, keep.length ? keep.map(fmt).join('; ') : '_none_', '',
      `**Candidate remove (> ${MAIN} km): ${drop.length}**`, drop.length ? drop.map(fmt).join('; ') : '_none_', '',
      `**Unknown, no lat/long: ${g.unknown.length}**`, g.unknown.length ? g.unknown.sort().join('; ') : '_none_', '');
  }
  L.push('## Not verified / caveats', '',
    '- Coastline = Natural Earth 10m (public domain): includes islands and large inlets; it does not tell a sea port from a river or lake city.',
    '- Distance is to the nearest coast of ANY sea, e.g. a city on a Red Sea gulf counts as coastal.',
    '- Lat/long come from the `country-state-city` package matched by name; a DB city that is not in the package (renamed, added by hand) is listed as unknown.',
    '- Straight-line distance, not road or river distance. Nothing was deleted.');
  fs.writeFileSync(OUT, L.join('\n'), 'utf8');
  console.log(`report: ${OUT} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log('cutoff table: ' + CUTOFFS.map((k) => `${k}km keep ${tot.within[k]} / remove ${tot.n - tot.unknown - tot.within[k]}`).join(' | ') + ` | unknown ${tot.unknown}`);
};

connectDB().then(run).then(() => process.exit(0)).catch((e) => { console.error(e.stack || e.message); process.exit(1); });
