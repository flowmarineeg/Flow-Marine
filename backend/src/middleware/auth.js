'use strict';

const jwt   = require('jsonwebtoken');
const { unauthorized } = require('../utils/responseHelper');
const User  = require('../modules/users/user.model');
const cache = require('../utils/cache');

const USER_TTL = 60_000; // 60 seconds

/**
 * Auth middleware — Sprint020
 *
 * Token resolution order:
 *   1. httpOnly cookie `token`  (primary — set by login endpoint)
 *   2. Authorization: Bearer <token>  (fallback — API clients / Postman / curl)
 *
 * Cache: user document cached for 60s by userId (PERF-001).
 * Invalidated by user.service on update/delete via cache.del(`user:<id>`).
 */
const authMiddleware = async (req, res, next) => {
  try {
    // ── 1. Resolve token ────────────────────────────────────────────────────
    let token = req.cookies?.token;
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) token = authHeader.split(' ')[1];
    }
    if (!token) return unauthorized(res, 'No token provided');

    // ── 2. Verify JWT ───────────────────────────────────────────────────────
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId  = String(decoded.id);

    // ── 3. User lookup — cache first ────────────────────────────────────────
    let user = cache.get(`user:${userId}`);

    if (!user) {
      user = await User.findOne({ _id: userId, isDeleted: false })
        .populate('roleId', 'name isSystem')
        .lean();

      if (user) cache.set(`user:${userId}`, user, USER_TTL);
    }

    if (!user)                    return unauthorized(res, 'User not found or deactivated');
    if (user.status === 'Inactive') return unauthorized(res, 'Account is inactive');

    req.user = user;
    next();
  } catch (err) {
    return unauthorized(res, 'Invalid or expired token');
  }
};

module.exports = authMiddleware;
