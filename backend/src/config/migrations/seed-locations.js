'use strict';

// Complete seed of SEA / COASTAL locations only. Idempotent (safe to run twice) and non-destructive: existing records
// are matched (countries by ISO code, ports by UN/LOCODE code, cities by country + name) and never changed or deleted,
// so referenced records keep their _id. Landlocked countries are never added.
//   npm run seed:locations [-- --dry]
// Data (src/config/data/, built once by scripts/build-location-data.js, no network at run time):
//   coastal-cities.json  cities within 50 km of the coast (Natural Earth 10m coastline + country-state-city lat/long)
//   seaports.json        UN/LOCODE entries with function code 1 (port), coastal or estuary, linked to city + country
//   terminals.json       hand-curated terminal names of a few major ports (no downloadable terminal source exists)
require('dotenv').config();
const { Country: LibCountry } = require('country-state-city');
const connectDB = require('../db');
const Country = require('../../modules/locations/country.model');
const City = require('../../modules/locations/city.model');
const Port = require('../../modules/locations/port.model');
const Terminal = require('../../modules/locations/terminal.model');
const logger = require('../../utils/logger');
const { isLandlockedCountry } = require('../../modules/locations/coastal.logic');
const cityData = require('../data/coastal-cities.json');
const portData = require('../data/seaports.json');
const terminalData = require('../data/terminals.json');

const DRY = process.argv.includes('--dry');
const BATCH = 1000;
const lc = (s) => String(s || '').trim().toLowerCase();
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
// returns how many were really inserted (duplicate-key rejects are fine and not counted)
const insert = async (Model, docs) => {
  try { return (await Model.insertMany(docs, { ordered: false })).length; } catch (e) {
    if (!e.writeErrors) throw e;
    return docs.length - e.writeErrors.length;
  }
};

const run = async () => {
  // ── countries: all coastal countries ────────────────────────────────────────
  const existing = await Country.find({}).lean();
  const byCode = new Map(existing.map((c) => [c.code, c]));
  const byName = new Map(existing.map((c) => [lc(c.name), c]));
  const countryId = new Map(); // ISO -> _id
  let cNew = 0; let cCur = 0;
  for (const lib of LibCountry.getAllCountries().filter((c) => !isLandlockedCountry(c.isoCode))) {
    const hit = byCode.get(lib.isoCode) || byName.get(lc(lib.name));
    if (hit) {
      countryId.set(lib.isoCode, hit._id);
      if (!hit.localCurrency && lib.currency) { cCur += 1; if (!DRY) await Country.updateOne({ _id: hit._id }, { $set: { localCurrency: lib.currency } }); }
      continue;
    }
    cNew += 1;
    if (!DRY) countryId.set(lib.isoCode, (await Country.create({ name: lib.name, code: lib.isoCode, localCurrency: lib.currency || null }))._id);
  }
  logger.info(`[locations] countries: ${cNew} ${DRY ? 'would be added' : 'added'}, ${cCur} currencies filled`);

  // ── cities within 50 km of the coast ────────────────────────────────────────
  let cityNew = 0;
  for (const [iso, names] of Object.entries(cityData)) {
    const id = countryId.get(iso);
    const have = id ? new Set((await City.find({ countryId: id }).select('name').lean()).flatMap((c) => [lc(c.name), norm(c.name)])) : new Set();
    const fresh = names.filter((n) => !have.has(lc(n)) && !have.has(norm(n)));
    if (DRY) { cityNew += fresh.length; continue; }
    if (!id) continue;
    for (let i = 0; i < fresh.length; i += BATCH) cityNew += await insert(City, fresh.slice(i, i + BATCH).map((name) => ({ name, countryId: id })));
  }
  logger.info(`[locations] cities: ${cityNew} ${DRY ? 'would be added' : 'added'}`);

  // ── sea ports (UN/LOCODE function 1), matched by code ───────────────────────
  const allPorts = await Port.find({}).select('code name cityId').lean();
  const havePort = new Set(allPorts.filter((p) => p.code).map((p) => p.code));
  const haveName = new Set(allPorts.map((p) => `${p.cityId}|${norm(p.name)}`)); // (name, city) is unique
  const cityKey = new Map(); // `${countryId}|${norm name}` -> city _id
  for (const c of await City.find({}).select('name countryId').lean()) cityKey.set(`${c.countryId}|${norm(c.name)}`, c._id);
  const newPorts = [];
  for (const p of portData) {
    if (havePort.has(p.code)) continue;
    const cid = countryId.get(p.country);
    const cityId = cid && cityKey.get(`${cid}|${norm(p.city)}`);
    if (!cid || !cityId || haveName.has(`${cityId}|${norm(p.name)}`)) continue; // dry run, city not created, or name taken in that city
    newPorts.push({ name: p.name, code: p.code, cityId, countryId: cid });
  }
  let portNew = newPorts.length;
  if (!DRY) { portNew = 0; for (let i = 0; i < newPorts.length; i += BATCH) portNew += await insert(Port, newPorts.slice(i, i + BATCH)); }
  logger.info(`[locations] ports: ${portNew} ${DRY ? 'would be added' : 'added'} (of ${portData.length} sea ports in the data)`);

  // ── terminals: only the curated, known ones ─────────────────────────────────
  let tNew = 0;
  for (const [code, names] of Object.entries(terminalData)) {
    const port = await Port.findOne({ code }).lean();
    if (!port) continue;
    for (const name of names) {
      if (await Terminal.exists({ name, portId: port._id })) continue;
      tNew += 1;
      if (!DRY) await Terminal.create({ name, portId: port._id });
    }
  }
  logger.info(`[locations] terminals: ${tNew} ${DRY ? 'would be added' : 'added'}`);
};

if (require.main === module) {
  connectDB().then(run).then(() => process.exit(0)).catch((e) => { logger.error(e.stack || e.message); process.exit(1); });
}

module.exports = { run };
