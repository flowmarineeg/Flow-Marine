'use strict';

const authService = require('./auth.service');
const { success, error } = require('../../utils/responseHelper');

// ─── Cookie config helper ─────────────────────────────────────────────────────
// Owner note #2: secure=true only in production; SameSite=strict in dev / none in prod
const cookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,               // not readable by JavaScript — XSS protection
    secure:   isProd,             // HTTPS only in production
    sameSite: isProd ? 'none' : 'strict',  // 'none' required for cross-origin in prod
    maxAge:   24 * 60 * 60 * 1000,         // 24h in ms — matches JWT_EXPIRES_IN default
    path:     '/',
  };
};

// ─── Login ────────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await authService.login(email, password);

    // Set httpOnly cookie — token never exposed to browser JS
    res.cookie('token', token, cookieOptions());

    // Return only user data in body — no token
    return success(res, { user }, 'Login successful');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  // Clear the auth cookie
  res.clearCookie('token', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    path:     '/',
  });
  return success(res, null, 'Logged out successfully');
};

// ─── Get current user (session check) ────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user._id);
    return success(res, user);
  } catch (err) {
    next(err);
  }
};

// ─── Change password ──────────────────────────────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user._id, currentPassword, newPassword);
    return success(res, null, 'Password changed successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

// ─── Forgot password ──────────────────────────────────────────────────────────
const forgotPassword = async (req, res, next) => {
  try {
    await authService.forgotPassword(req.body.email);
    return success(res, null, 'If that email exists, a reset link has been sent');
  } catch (err) {
    next(err);
  }
};

// ─── Reset password ───────────────────────────────────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);
    return success(res, null, 'Password reset successfully. You can now log in.');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    next(err);
  }
};

module.exports = { login, logout, getMe, changePassword, forgotPassword, resetPassword };
