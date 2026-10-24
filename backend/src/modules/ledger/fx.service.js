'use strict';

const ExchangeRate = require('./exchangeRate.model');
const AppError = require('../../utils/AppError');
const { BASE_CURRENCY } = require('../../utils/money');

/**
 * Rate to convert `currency` -> base on `date`: the latest rate dated on or
 * before it. Same currency is always 1. Callers COPY the result onto their
 * own document (lock-onto-document) — a later rate change never touches it.
 */
const getRate = async (currency, date = new Date(), to = BASE_CURRENCY) => {
  const cur = String(currency).toUpperCase();
  if (cur === to) return 1;
  const row = await ExchangeRate.findOne({ from: cur, to, date: { $lte: new Date(date) } }).sort({ date: -1 }).lean();
  if (!row) throw new AppError(400, `No exchange rate ${cur}->${to} on or before ${new Date(date).toISOString().slice(0, 10)}`, 'FX_RATE_MISSING');
  return row.rate;
};

const setRate = async ({ date, from, to = BASE_CURRENCY, rate, source }, createdBy) => {
  if (!(rate > 0)) throw new AppError(400, 'Rate must be greater than zero', 'FX_RATE_INVALID');
  return ExchangeRate.findOneAndUpdate(
    { from: String(from).toUpperCase(), to: String(to).toUpperCase(), date: new Date(date) },
    { $set: { rate, source: source || 'manual', createdBy } },
    { upsert: true, new: true }
  ).lean();
};

const list = async ({ from, to } = {}) => {
  const q = {};
  if (from) q.from = String(from).toUpperCase();
  if (to) q.to = String(to).toUpperCase();
  return ExchangeRate.find(q).sort({ date: -1 }).limit(200).lean();
};

module.exports = { getRate, setRate, list };
