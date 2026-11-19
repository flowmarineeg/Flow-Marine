'use strict';

// ONE-OFF generator for the static data behind `npm run seed:locations` (sea / coastal locations only).
//   node scripts/build-location-data.js --coast <ne_10m_coastline.geojson> --locode <code-list.csv>
// Sources: Natural Earth 10m coastline (public domain) and UN/LOCODE (UNECE, CSV mirror datasets/un-locode),
// city names + lat/long from the `country-state-city` package. Writes src/config/data/{coastal-cities,seaports}.json.
// Not used at runtime. terminals.json is hand-curated (no downloadable terminal source) and is NOT touched here.
const fs = require('fs');
const path = require('path');
const { Country: LibCountry, City: LibCity } = require('country-state-city');
const { isLandlockedCountry, ESTUARY_PORT_CODES } = require('../src/modules/locations/coastal.logic');

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const COAST = val('--coast'); const LOCODE = val('--locode');
if (!COAST || !LOCODE) { console.error('usage: node scripts/build-location-data.js --coast <geojson> --locode <csv>'); process.exit(2); }
const OUT_DIR = path.join(__dirname, '..', 'src', 'config', 'data');
const MAX_KM = 50;
const R = 6371.0088; const DEG = Math.PI / 180;

// ── coastline index (1-degree grid of segments) ───────────────────────────────
const gj = JSON.parse(fs.readFileSync(COAST, 'utf8'));
const segs = []; const cells = new Map();
const add = (line) => { for (let i = 1; i < line.length; i += 1) segs.push([line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]]); };
for (const f of gj.features) { const g = f.geometry; if (!g) continue; if (g.type === 'LineString') add(g.coordinates); else if (g.type === 'MultiLineString') g.coordinates.forEach(add); }
segs.forEach((s, i) => {
  for (let x = Math.floor(Math.min(s[0], s[2])); x <= Math.floor(Math.max(s[0], s[2])); x += 1) {
    for (let y = Math.floor(Math.min(s[1], s[3])); y <= Math.floor(Math.max(s[1], s[3])); y += 1) { const k = `${x},${y}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); }
  }
});
const distSeg = (lon, lat, s) => {
  const kx = Math.cos(lat * DEG) * R * DEG; const ky = R * DEG;
  const ax = (s[0] - lon) * kx; const ay = (s[1] - lat) * ky; const bx = (s[2] - lon) * kx; const by = (s[3] - lat) * ky;
  const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
  return Math.hypot(ax + t * dx, ay + t * dy);
};
/** km to the nearest coast, or Infinity when farther than ~110 km (enough for a 50 km cutoff). */
const coastKm = (lon, lat) => {
  const ry = 1; const rx = Math.min(30, Math.ceil(1 / Math.max(0.15, Math.cos(lat * DEG))));
  const cx = Math.floor(lon); const cy = Math.floor(lat); const seen = new Set(); let best = Infinity;
  for (let x = cx - rx; x <= cx + rx; x += 1) for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (const i of cells.get(`${x},${y}`) || []) { if (seen.has(i)) continue; seen.add(i); const d = distSeg(lon, lat, segs[i]); if (d < best) best = d; }
  }
  return best;
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// ── cities within MAX_KM of the coast, per coastal country ────────────────────
const cityNames = {}; const cityIndex = {}; // ISO -> [names], ISO -> Map(norm name -> {name, lon, lat})
for (const c of LibCountry.getAllCountries()) {
  if (isLandlockedCountry(c.isoCode)) continue;
  const keep = []; const idx = new Map();
  for (const lc of LibCity.getCitiesOfCountry(c.isoCode) || []) {
    const name = String(lc.name || '').trim(); const k = norm(name);
    if (!name || name.length > 100 || idx.has(k)) continue;
    const lon = num(lc.longitude); const lat = num(lc.latitude);
    if (lon === null || lat === null || (lon === 0 && lat === 0)) continue;
    idx.set(k, { name, lon, lat });
    if (coastKm(lon, lat) <= MAX_KM) keep.push(name);
  }
  cityIndex[c.isoCode] = idx;
  if (keep.length) cityNames[c.isoCode] = keep.sort((a, b) => a.localeCompare(b));
}

// ── UN/LOCODE seaports (function code 1) ──────────────────────────────────────
const parseCsv = (line) => { const o = []; let c = ''; let q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
const coord = (s) => { // "5120N 00419E"
  const m = /^(\d{2})(\d{2})([NS]) (\d{3})(\d{2})([EW])$/.exec(String(s || '').trim());
  if (!m) return null;
  return { lat: (Number(m[1]) + Number(m[2]) / 60) * (m[3] === 'S' ? -1 : 1), lon: (Number(m[4]) + Number(m[5]) / 60) * (m[6] === 'W' ? -1 : 1) };
};
const OK_STATUS = new Set(['AA', 'AC', 'AF', 'AI', 'AM', 'AS', 'AQ', 'RL', 'RN', 'UR']); // not QQ (unverified), RQ (rejected), XX (to be removed)
const ports = []; const extraCities = {}; const seenPort = new Set();
const stat = { function1: 0, landlocked: 0, status: 0, noCoords: 0, inland: 0, duplicateName: 0, kept: 0 };
for (const line of fs.readFileSync(LOCODE, 'utf8').split(/\r?\n/).slice(1)) {
  if (!line) continue;
  const r = parseCsv(line);
  const [, cc, loc, name, , , status, fn, , , coords] = r;
  if (!fn || fn[0] !== '1') continue;
  stat.function1 += 1;
  if (isLandlockedCountry(cc)) { stat.landlocked += 1; continue; }
  if (!OK_STATUS.has(status)) { stat.status += 1; continue; }
  const code = `${cc}${loc}`;
  if (!cityIndex[cc]) { stat.status += 1; continue; } // not a real coastal country (e.g. XZ = installations in international waters)
  const idx = cityIndex[cc];
  const match = idx.get(norm(name));
  let pos = coord(coords) || (match ? { lon: match.lon, lat: match.lat } : null);
  if (!pos) { stat.noCoords += 1; continue; }
  if (!(ESTUARY_PORT_CODES[code] || coastKm(pos.lon, pos.lat) <= MAX_KM)) { stat.inland += 1; continue; }
  const cityName = match ? match.name : String(name).trim();
  const dupKey = `${cc}|${norm(name)}|${norm(cityName)}`; // (name, city) is unique in the DB: keep the first code only
  if (seenPort.has(dupKey)) { stat.duplicateName += 1; continue; }
  seenPort.add(dupKey);
  if (!match || !(cityNames[cc] || []).includes(match.name)) { (extraCities[cc] = extraCities[cc] || new Set()).add(cityName); }
  ports.push({ code, name: String(name).trim().slice(0, 100), country: cc, city: cityName.slice(0, 100) });
  stat.kept += 1;
}
for (const [cc, set] of Object.entries(extraCities)) cityNames[cc] = [...new Set([...(cityNames[cc] || []), ...set])].sort((a, b) => a.localeCompare(b));
ports.sort((a, b) => a.code.localeCompare(b.code));

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'coastal-cities.json'), JSON.stringify(cityNames));
fs.writeFileSync(path.join(OUT_DIR, 'seaports.json'), JSON.stringify(ports));
const nCities = Object.values(cityNames).reduce((n, a) => n + a.length, 0);
console.log(`cities within ${MAX_KM} km (+ port places): ${nCities} in ${Object.keys(cityNames).length} countries`);
console.log('seaports:', JSON.stringify(stat));
