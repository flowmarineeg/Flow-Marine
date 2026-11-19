'use strict';

// Pure helpers for the paginated Locations list endpoints (no DB).
const mongoose = require('mongoose');
const { escapeRegex } = require('../../utils/escapeRegex');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** page >= 1 (default 1); limit 1..100 (default 20). Anything that is not a number falls back to the default. */
const parsePaging = ({ page, limit } = {}) => {
  const p = parseInt(page, 10);
  const l = parseInt(limit, 10);
  const safePage = Number.isFinite(p) && p >= 1 ? p : 1;
  const safeLimit = Number.isFinite(l) && l >= 1 ? Math.min(l, MAX_LIMIT) : DEFAULT_LIMIT;
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

/** Case-insensitive "contains" match on the given fields; null when there is nothing to search. */
const searchFilter = (search, fields) => {
  const s = String(search ?? '').trim();
  if (!s) return null;
  const rx = escapeRegex(s);
  return { $or: fields.map((f) => ({ [f]: { $regex: rx, $options: 'i' } })) };
};

/** Parent filter value: empty is ignored, anything else must be an ObjectId (else a 400, not a CastError 500). */
const idParam = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value);
  if (!mongoose.isValidObjectId(v)) throw { status: 400, message: `Invalid ${label}` };
  return v;
};

/** Stable sort: name, then _id (so pages never overlap or skip when names repeat). */
const STABLE_SORT = Object.freeze({ name: 1, _id: 1 });

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, STABLE_SORT, parsePaging, searchFilter, idParam };
