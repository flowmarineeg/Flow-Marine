'use strict';

// Sprint050 P3 / D5-A — integer minor-unit money. New V2 collections store
// amounts as integers (amountMinor) plus a currency code; legacy float fields
// are converted once, at posting time. No float arithmetic is ever done on
// money here: parsing and formatting work on the decimal STRING.

const BASE_CURRENCY = 'USD';

// Decimals per currency (ISO 4217 minor units). Unknown codes default to 2.
const CURRENCY_DECIMALS = {
  USD: 2, EUR: 2, GBP: 2, AED: 2, SAR: 2, EGP: 2, CNY: 2, INR: 2,
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3,
  JPY: 0, KRW: 0, VND: 0,
};

const decimalsOf = (currency) => {
  const c = String(currency || BASE_CURRENCY).toUpperCase();
  return Object.prototype.hasOwnProperty.call(CURRENCY_DECIMALS, c) ? CURRENCY_DECIMALS[c] : 2;
};

/**
 * Convert a decimal amount (number or numeric string) to integer minor units.
 * Parses the decimal text so 1.005 / 0.1+0.2 style float noise cannot leak in;
 * extra fractional digits are rounded half-up (away from zero) at the currency scale.
 */
const toMinor = (amount, currency = BASE_CURRENCY) => {
  const d = decimalsOf(currency);
  if (amount === null || amount === undefined || amount === '') throw new TypeError('toMinor: amount required');
  let s = typeof amount === 'number' ? numberToPlainString(amount) : String(amount).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new TypeError(`toMinor: not a decimal amount: ${amount}`);
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  let [int, frac = ''] = s.split('.');
  const roundUp = frac.length > d && frac.charCodeAt(d) >= 53; // digit after scale >= '5'
  frac = frac.slice(0, d).padEnd(d, '0');
  let minor = Number(int + frac);
  if (roundUp) minor += 1;
  if (!Number.isSafeInteger(minor)) throw new RangeError('toMinor: amount out of safe range');
  return neg ? -minor : minor;
};

// Number.toString can give exponent form (1e-7); expand it without float math.
function numberToPlainString(n) {
  if (!Number.isFinite(n)) throw new TypeError('toMinor: non-finite amount');
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(Math.min(20, 12));
}

/** Integer minor units -> plain decimal string ("1234.50"). */
const fromMinor = (minor, currency = BASE_CURRENCY) => {
  assertMinor(minor);
  const d = decimalsOf(currency);
  const neg = minor < 0;
  const abs = String(Math.abs(minor)).padStart(d + 1, '0');
  const out = d === 0 ? abs : `${abs.slice(0, -d)}.${abs.slice(-d)}`;
  return neg ? `-${out}` : out;
};

/** "1,234.50 USD" style display string. */
const format = (minor, currency = BASE_CURRENCY) => {
  const plain = fromMinor(minor, currency);
  const neg = plain.startsWith('-');
  const [int, frac] = plain.replace('-', '').split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${frac ? `.${frac}` : ''} ${String(currency || BASE_CURRENCY).toUpperCase()}`;
};

const assertMinor = (n) => {
  if (!Number.isSafeInteger(n)) throw new TypeError(`Money must be an integer minor-unit value, got ${n}`);
  return n;
};

const add = (...xs) => xs.reduce((a, b) => assertMinor(a) + assertMinor(b), 0);
const sub = (a, b) => assertMinor(a) - assertMinor(b);

/**
 * Split `total` minor units across weights (e.g. basis points) with NO lost cent:
 * largest-remainder method; leftover units go to the largest remainders, ties
 * to the earliest index. sum(result) === total always.
 */
const allocate = (total, weights) => {
  assertMinor(total);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length || sum <= 0) throw new RangeError('allocate: weights must sum to > 0');
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const shares = weights.map((w) => Math.floor((abs * w) / sum));
  let left = abs - shares.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, rem: (abs * w) % sum }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) shares[order[k].i] += 1;
  return shares.map((s) => sign * s);
};

module.exports = { BASE_CURRENCY, CURRENCY_DECIMALS, decimalsOf, toMinor, fromMinor, format, add, sub, allocate, assertMinor };
