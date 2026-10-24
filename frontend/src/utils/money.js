// Sprint050 P3 - integer minor-unit money helpers (mirror of backend/src/utils/money.js).
// Amounts are exchanged with the API as integers (amountMinor). Never do float
// arithmetic on money: parse the decimal text, compute on integers, format back.

export const BASE_CURRENCY = 'USD';

const CURRENCY_DECIMALS = {
  USD: 2, EUR: 2, GBP: 2, AED: 2, SAR: 2, EGP: 2, CNY: 2, INR: 2,
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3,
  JPY: 0, KRW: 0, VND: 0,
};

export const decimalsOf = (currency) => {
  const c = String(currency || BASE_CURRENCY).toUpperCase();
  return Object.prototype.hasOwnProperty.call(CURRENCY_DECIMALS, c) ? CURRENCY_DECIMALS[c] : 2;
};

// "1234.56" (user input) -> 123456. Returns null when the text is not a valid amount.
export const toMinor = (text, currency = BASE_CURRENCY) => {
  const d = decimalsOf(currency);
  let s = String(text ?? '').trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [int, fracRaw = ''] = s.split('.');
  const roundUp = fracRaw.length > d && fracRaw.charCodeAt(d) >= 53;
  const frac = fracRaw.slice(0, d).padEnd(d, '0');
  let minor = Number(int + frac);
  if (roundUp) minor += 1;
  if (!Number.isSafeInteger(minor)) return null;
  return neg ? -minor : minor;
};

// 123456 -> "1234.56"
export const fromMinor = (minor, currency = BASE_CURRENCY) => {
  if (!Number.isSafeInteger(minor)) return '';
  const d = decimalsOf(currency);
  const abs = String(Math.abs(minor)).padStart(d + 1, '0');
  const out = d === 0 ? abs : `${abs.slice(0, -d)}.${abs.slice(-d)}`;
  return minor < 0 ? `-${out}` : out;
};

// 123456789 -> "1,234,567.89 USD"
export const formatMoney = (minor, currency = BASE_CURRENCY) => {
  const plain = fromMinor(minor, currency);
  if (!plain) return '-';
  const neg = plain.startsWith('-');
  const [int, frac] = plain.replace('-', '').split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${frac ? `.${frac}` : ''} ${String(currency || BASE_CURRENCY).toUpperCase()}`;
};

export const addMinor = (...xs) => xs.reduce((a, b) => a + b, 0);
export const subMinor = (a, b) => a - b;
