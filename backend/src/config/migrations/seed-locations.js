'use strict';

// Fills Countries (all) and Cities (selected countries) from the `country-state-city` library.
// Idempotent and non-destructive: existing records are matched (by ISO code / case-insensitive name) and never
// overwritten or deleted; a missing local currency on an existing country is filled in.
//   npm run seed:locations [-- --dry] [-- --all-cities] [-- --countries-only]
require('dotenv').config();
const { Country: LibCountry, City: LibCity } = require('country-state-city');
const connectDB = require('../db');
const Country = require('../../modules/locations/country.model');
const City = require('../../modules/locations/city.model');
const logger = require('../../utils/logger');

const DRY = process.argv.includes('--dry');
const ALL_CITIES = process.argv.includes('--all-cities');
const COUNTRIES_ONLY = process.argv.includes('--countries-only');

// Owner decision 2026-10-27: cities for these countries + any country already in use; the rest on request.
const CITY_COUNTRIES = ['EG', 'SA', 'AE', 'JO', 'SD', 'DJ', 'OM', 'KW', 'QA', 'BH', 'YE', 'TR', 'IN', 'CN', 'SG'];

const BATCH = 1000;
const lc = (s) => String(s || '').trim().toLowerCase();

/** Pure: unique, trimmed, <=100-char city names of one country, original casing kept. */
const uniqueCityNames = (cities) => {
  const seen = new Set();
  const out = [];
  for (const c of cities) {
    const name = String(c.name || '').trim();
    if (!name || name.length > 100 || seen.has(lc(name))) continue;
    seen.add(lc(name));
    out.push(name);
  }
  return out;
};

const run = async () => {
  const existingCountries = await Country.find({}).lean();
  const byCode = new Map(existingCountries.map((c) => [c.code, c]));
  const byName = new Map(existingCountries.map((c) => [lc(c.name), c]));

  let cInserted = 0; let cCurrency = 0;
  const countryDocs = new Map(); // ISO -> country _id
  for (const lib of LibCountry.getAllCountries()) {
    const hit = byCode.get(lib.isoCode) || byName.get(lc(lib.name));
    if (hit) {
      countryDocs.set(lib.isoCode, hit._id);
      if (!hit.localCurrency && lib.currency) { cCurrency += 1; if (!DRY) await Country.updateOne({ _id: hit._id }, { $set: { localCurrency: lib.currency } }); }
      continue;
    }
    cInserted += 1;
    if (!DRY) countryDocs.set(lib.isoCode, (await Country.create({ name: lib.name, code: lib.isoCode, localCurrency: lib.currency || null }))._id);
  }
  logger.info(`[locations] countries: ${cInserted} to add, ${cCurrency} currencies filled (library has ${LibCountry.getAllCountries().length})`);
  if (COUNTRIES_ONLY) return;

  // countries already in use by cities keep getting their full list
  const inUse = new Set((await City.distinct('countryId')).map(String));
  const wanted = LibCountry.getAllCountries().filter((c) => ALL_CITIES || CITY_COUNTRIES.includes(c.isoCode) || inUse.has(String(countryDocs.get(c.isoCode))));

  let cities = 0;
  for (const lib of wanted) {
    const countryId = countryDocs.get(lib.isoCode);
    if (!countryId) { // dry run on a country that does not exist yet
      cities += uniqueCityNames(LibCity.getCitiesOfCountry(lib.isoCode) || []).length;
      continue;
    }
    const have = new Set((await City.find({ countryId }).select('name').lean()).map((c) => lc(c.name)));
    const names = uniqueCityNames(LibCity.getCitiesOfCountry(lib.isoCode) || []).filter((n) => !have.has(lc(n)));
    cities += names.length;
    if (DRY) continue;
    for (let i = 0; i < names.length; i += BATCH) {
      await City.insertMany(names.slice(i, i + BATCH).map((name) => ({ name, countryId })), { ordered: false }).catch((e) => {
        if (!e.writeErrors) throw e; // duplicate-key races are fine
      });
    }
  }
  logger.info(`[locations] cities: ${cities} ${DRY ? 'would be added' : 'added'} for ${wanted.length} countries${ALL_CITIES ? ' (all)' : ''}`);
};

if (require.main === module) {
  connectDB().then(run).then(() => process.exit(0)).catch((e) => { logger.error(e.stack || e.message); process.exit(1); });
}

module.exports = { uniqueCityNames, CITY_COUNTRIES };
