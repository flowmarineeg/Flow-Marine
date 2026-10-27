'use strict';

// Pure format checks shared by the master-data modules (partners, ports, container types, ...).
// Light structural checks only - they reject obvious typos, they do not prove an account exists.

const stripSpaces = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();

/** IBAN: 15-34 chars, 2 letters + 2 digits + alphanumerics, mod-97 checksum. */
const isIban = (v) => {
  const s = stripSpaces(v);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const n = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of n) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
};

/** SWIFT/BIC: 8 or 11 chars (4 bank letters, 2 country letters, 2 location, optional 3 branch). */
const isSwift = (v) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(stripSpaces(v));

/** UN/LOCODE: 2-letter country + 3 alphanumerics. */
const isUnLocode = (v) => /^[A-Z]{2}[A-Z0-9]{3}$/.test(stripSpaces(v));

/** Container ISO 6346 size/type code, e.g. 22G1, 45G1, 42R1 (4 chars). */
const isIsoContainerCode = (v) => /^[0-9A-Z]{2}[A-Z][0-9]$/.test(stripSpaces(v));

const isCurrencyCode = (v) => /^[A-Z]{3}$/.test(String(v ?? '').trim().toUpperCase());

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '').trim());

/** TEU factor from a container size label (20ft -> 1, 40ft/40HC -> 2, 45ft -> 2.25). Informational master data only; capacity uses teuResolver (R10). */
const teuFactorForSize = (size) => {
  const s = String(size || '');
  if (s.startsWith('20')) return 1;
  if (s.startsWith('45')) return 2.25;
  return 2;
};

module.exports = { isIban, isSwift, isUnLocode, isIsoContainerCode, isCurrencyCode, isEmail, teuFactorForSize, stripSpaces };
