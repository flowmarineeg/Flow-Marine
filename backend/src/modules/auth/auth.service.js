'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const User   = require('../users/user.model');
const cache  = require('../../utils/cache');
const logger = require('../../utils/logger');
const {
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} = require('../../utils/mailer');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const signToken = (id, tokenVersion = 0) =>
  jwt.sign({ id, tv: tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });

const safeUser = (user) => ({
  _id:       user._id,
  name:      user.name,
  email:     user.email,
  status:    user.status,
  roleId:    user.roleId,
  lastLogin: user.lastLogin,
  createdAt: user.createdAt,
});

// ─── Login ────────────────────────────────────────────────────────────────────
const login = async (email, password) => {
  const normalizedEmail = email.trim().toLowerCase();
  logger.debug(`[Auth] Login attempt: ${normalizedEmail}`);

  const user = await User.findOne({ email: normalizedEmail, isDeleted: false })
    .populate('roleId', 'name isSystem');

  if (!user) {
    logger.debug(`[Auth] No user found for: ${normalizedEmail}`);
    throw { status: 401, message: 'Invalid email or password' };
  }

  logger.debug(`[Auth] User found: ${user.email} | status: ${user.status} | hasPassword: ${!!user.password}`);

  if (user.status === 'Inactive') {
    throw { status: 401, message: 'Account is inactive. Contact administrator.' };
  }

  if (!user.password) {
    throw { status: 401, message: 'Account not activated. Check your invitation email.' };
  }

  const match = await bcrypt.compare(password, user.password);
  logger.debug(`[Auth] Password match: ${match}`);

  if (!match) {
    throw { status: 401, message: 'Invalid email or password' };
  }

  user.lastLogin = new Date();
  await user.save();

  const token = signToken(user._id, user.tokenVersion);
  logger.debug(`[Auth] Login successful: ${user.email}`);

  return { token, user: safeUser(user) };
};

// ─── Get current user ─────────────────────────────────────────────────────────
const getMe = async (userId) => {
  const user = await User.findOne({ _id: userId, isDeleted: false })
    .populate('roleId', 'name isSystem')
    .lean();
  if (!user) throw { status: 404, message: 'User not found' };
  return safeUser(user);
};

// ─── Change password ──────────────────────────────────────────────────────────
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user)          throw { status: 404, message: 'User not found' };
  if (!user.password) throw { status: 400, message: 'No password set. Use reset password flow.' };

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) throw { status: 400, message: 'Current password is incorrect' };

  user.password = await bcrypt.hash(newPassword, 12);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // Sprint049 M7: revoke every older session
  await user.save();
  cache.del(`user:${userId}`);

  sendPasswordChangedEmail(user.email, user.name).catch(() => {});
  // Re-issue so the session that just changed the password stays signed in
  return { token: signToken(user._id, user.tokenVersion) };
};

// ─── Forgot password ──────────────────────────────────────────────────────────
const forgotPassword = async (email) => {
  const user = await User.findOne({ email: email.trim().toLowerCase(), isDeleted: false });
  if (!user || user.status === 'Inactive') return;

  const token = crypto.randomBytes(32).toString('hex');
  user.resetToken          = token;
  user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  await sendPasswordResetEmail(user.email, user.name, resetUrl);
};

// ─── Reset password ───────────────────────────────────────────────────────────
const resetPassword = async (token, newPassword) => {
  const user = await User.findOne({
    resetToken:          token,
    resetTokenExpiresAt: { $gt: new Date() },
    isDeleted:           false,
  });
  if (!user) throw { status: 400, message: 'Reset link is invalid or has expired' };

  user.password            = await bcrypt.hash(newPassword, 12);
  user.resetToken          = null;
  user.resetTokenExpiresAt = null;
  user.tokenVersion        = (user.tokenVersion || 0) + 1; // Sprint049 M7
  await user.save();
  cache.del(`user:${user._id}`);

  sendPasswordChangedEmail(user.email, user.name).catch(() => {});
};

module.exports = { login, getMe, changePassword, forgotPassword, resetPassword };
