'use strict';

const crypto = require('crypto');

/**
 * CSRF protection — Sprint049 (audit C1)
 *
 * The auth cookie is SameSite=None in production (frontend and backend are on
 * different origins), so the browser attaches it to cross-site requests. To
 * stop a forged request we require a per-session token in the X-CSRF-Token
 * header on every state-changing request that is authenticated by the cookie.
 *
 * The token is stateless: HMAC(JWT_SECRET, jwt-cookie-value). The login /
 * me / change-password responses return it in the X-CSRF-Token response
 * header (exposed through CORS). A third-party site cannot read that header,
 * so it cannot build a valid request.
 *
 * Requests with no auth cookie (login, forgot/reset password, accept-invite,
 * Bearer-header API clients) carry no ambient credential, so they are exempt.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/users/accept-invite',
];

const csrfTokenFor = (jwtToken) =>
  crypto.createHmac('sha256', `${process.env.JWT_SECRET}:csrf`).update(String(jwtToken)).digest('hex');

const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookieToken = req.cookies?.token;
  if (!cookieToken) return next();
  if (EXEMPT_PATHS.includes(req.path) || EXEMPT_PATHS.includes(req.originalUrl.split('?')[0])) return next();

  const sent     = String(req.get('X-CSRF-Token') || '');
  const expected = csrfTokenFor(cookieToken);
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();

  return res.status(403).json({ success: false, message: 'Invalid or missing CSRF token', code: 'CSRF_INVALID' });
};

module.exports = { csrfProtection, csrfTokenFor };
