'use strict';

const express      = require('express');
const router       = express.Router();
const { rateLimit } = require('express-rate-limit');
const controller   = require('./auth.controller');
const authMiddleware = require('../../middleware/auth');
const auditLogger  = require('../../middleware/auditLogger');
const {
  validateLogin,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
} = require('./auth.validation');

// ─── Rate limiter — auth routes only (Owner note #3) ─────────────────────────
// 20 attempts per 15 minutes per IP. Protects login, forgot-password, reset-password.
// No global rate limiting is applied anywhere else in the app.
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,  // 15 minutes
  max:             20,               // max 20 requests per window per IP
  standardHeaders: true,             // Return rate limit info in RateLimit-* headers
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many attempts from this IP, please try again in 15 minutes',
  },
});

// ─── Public routes ────────────────────────────────────────────────────────────
router.post('/login',           authLimiter, validateLogin,          auditLogger('auth'), controller.login);
router.post('/forgot-password', authLimiter, validateForgotPassword, controller.forgotPassword);
router.post('/reset-password',  authLimiter, validateResetPassword,  controller.resetPassword);

// ─── Protected routes ─────────────────────────────────────────────────────────
router.post('/logout',           authMiddleware, auditLogger('auth'), controller.logout);
router.get('/me',                authMiddleware, controller.getMe);
router.patch('/change-password', authMiddleware, validateChangePassword, controller.changePassword);

module.exports = router;
