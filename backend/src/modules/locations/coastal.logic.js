'use strict';

// Pure coastal / landlocked classification for Locations master data (no DB, no I/O).
// The repo has no coast data, so this is a small REVIEWED static list approved by the owner (2026-11-19):
// 44 landlocked countries (incl. AZ, KZ, TM, which only touch the Caspian). Cities are NOT classified here;
// the city rule is conservative (a city is kept when it has a port/terminal or any reference).

const LANDLOCKED_COUNTRY_CODES = Object.freeze([
  'AF', 'AM', 'AT', 'AZ', 'BY', 'BT', 'BO', 'BW', 'BF', 'BI',
  'CF', 'TD', 'CZ', 'SZ', 'ET', 'HU', 'KZ', 'XK', 'KG', 'LA',
  'LS', 'LI', 'LU', 'MW', 'ML', 'MD', 'MN', 'NP', 'NE', 'MK',
  'PY', 'RW', 'SM', 'RS', 'SK', 'SS', 'CH', 'TJ', 'TM', 'UG',
  'UZ', 'VA', 'ZM', 'ZW',
]);
const LANDLOCKED = new Set(LANDLOCKED_COUNTRY_CODES);

/** River / estuary ports that ocean-going ships actually call (kept, listed for owner review). Far-inland river ports
 *  (Wuhan, Chongqing, Nanjing) were removed from this list on owner request 2026-11-19. */
const ESTUARY_PORT_CODES = Object.freeze({
  CNSHA: 'Shanghai - Yangtze estuary',
  CNCAN: 'Guangzhou - Pearl River',
  DEHAM: 'Hamburg - Elbe',
  NLRTM: 'Rotterdam - Nieuwe Maas',
  BEANR: 'Antwerp - Scheldt',
  GBLON: 'London - Thames',
  INCCU: 'Kolkata - Hooghly river',
  INHAL: 'Haldia - Hooghly river',
  BDCGP: 'Chattogram - Karnaphuli river',
  BDMGL: 'Mongla - Pasur river',
  THBKK: 'Bangkok - Chao Phraya',
  VNSGN: 'Ho Chi Minh City - Saigon river',
  MMRGN: 'Yangon - Yangon river',
  IQBSR: 'Basra - Shatt al-Arab',
  IQUQR: 'Umm Qasr - Khor Abdullah',
  IRKHO: 'Khorramshahr - Shatt al-Arab',
  USHOU: 'Houston - ship channel',
  USMSY: 'New Orleans - Mississippi',
});

const PROBE_NAME_RX = /^E2E\b|^ZS|^ZV/i;
const NON_SEA_NAME_RX = /\b(river|inland|dry\s*port|icd|lake|canal)\b/i;

const norm = (v) => String(v || '').trim().toUpperCase();

const isLandlockedCountry = (code) => LANDLOCKED.has(norm(code));

/** Real UN/LOCODE of a few ports we hold under a wrong or look-alike code (reviewed). */
const KNOWN_LOCODE_FIXES = Object.freeze({ PKKHA: 'PKKHI' });

/**
 * Review flags for one port. Never a delete decision: flags only put the record on the owner's review list.
 * @returns {string[]} reasons (empty when nothing to flag)
 */
const portReviewFlags = ({ name, code } = {}) => {
  const flags = [];
  const c = norm(code);
  if (PROBE_NAME_RX.test(String(name || ''))) flags.push('probe leftover (e2e/audit test data)');
  if (ESTUARY_PORT_CODES[c]) flags.push(`river/estuary port: ${ESTUARY_PORT_CODES[c]}`);
  if (NON_SEA_NAME_RX.test(String(name || ''))) flags.push('name suggests a river/inland/dry port');
  if (KNOWN_LOCODE_FIXES[c]) flags.push(`suspect code ${c} (UN/LOCODE is ${KNOWN_LOCODE_FIXES[c]})`);
  return flags;
};

/**
 * Coastal validation for NEW locations. Returns an error message or null.
 * Only the country level can be decided from data we hold; cities and ports inherit from the country.
 */
const coastalCountryError = (country) => (
  country && isLandlockedCountry(country.code)
    ? `${country.name || country.code} is landlocked - only sea / coastal locations can be added`
    : null
);

module.exports = {
  LANDLOCKED_COUNTRY_CODES, ESTUARY_PORT_CODES, KNOWN_LOCODE_FIXES,
  isLandlockedCountry, portReviewFlags, coastalCountryError,
};
