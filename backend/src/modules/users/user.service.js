'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User   = require('./user.model');
const cache  = require('../../utils/cache');
const { sendInvitationEmail } = require('../../utils/mailer');
const { escapeRegex } = require('../../utils/escapeRegex');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// Invalidate the auth middleware's cached user entry
const invalidateUser = (id) => cache.del(`user:${String(id)}`);

// A partner role needs a partner and nothing else may carry one (bookings sprint 2026-11-10).
const resolvePartnerId = async (roleId, partnerId) => {
  const Role = require('../roles/role.model');
  const role = await Role.findById(roleId).select('isPartnerRole').lean();
  if (!role) throw { status: 400, message: 'Role not found' };
  if (!role.isPartnerRole) {
    if (partnerId) throw { status: 400, message: 'Only users of a partner role can be linked to a partner' };
    return null;
  }
  if (!partnerId) throw { status: 400, message: 'A partner is required for a user of a partner role' };
  const Partner = require('../partners/partner.model');
  const partner = await Partner.findById(partnerId).select('status').lean();
  if (!partner) throw { status: 400, message: 'Partner not found' };
  if (partner.status !== 'Active') throw { status: 400, message: 'Partner is not Active' };
  return partnerId;
};

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '' } = {}) => {
  const query = { isDeleted: false };
  if (status) query.status = status;
  if (search) {
    const rx = escapeRegex(search);
    query.$or = [
      { name:  { $regex: rx, $options: 'i' } },
      { email: { $regex: rx, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    User.find(query)
      .populate('roleId', 'name isPartnerRole')
      .populate('partnerId', 'code name')
      .select('-password -resetToken -resetTokenExpiresAt -inviteToken -inviteExpiresAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(query),
  ]);

  return { data, total };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id) => {
  const user = await User.findOne({ _id: id, isDeleted: false })
    .populate('roleId', 'name isSystem isPartnerRole')
    .populate('partnerId', 'code name')
    .select('-password -resetToken -resetTokenExpiresAt -inviteToken -inviteExpiresAt')
    .lean();
  if (!user) throw { status: 404, message: 'User not found' };
  return user;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const create = async (data, createdBy) => {
  const exists = await User.findOne({ email: data.email.toLowerCase() });
  if (exists) throw { status: 400, message: 'Email already exists' };

  const partnerId = await resolvePartnerId(data.roleId, data.partnerId);
  const hashed = await bcrypt.hash(data.password, 12);
  const user = await User.create({
    name:      data.name,
    email:     data.email.toLowerCase(),
    password:  hashed,
    roleId:    data.roleId,
    partnerId,
    status:    data.status || 'Active',
    isInvited: false,
    createdBy,
  });

  return getById(user._id);
};

// ─── Invite ───────────────────────────────────────────────────────────────────
const inviteUser = async (data, createdBy) => {
  const exists = await User.findOne({ email: data.email.toLowerCase() });
  if (exists) throw { status: 400, message: 'Email already exists' };

  const partnerId = await resolvePartnerId(data.roleId, data.partnerId);
  const token    = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await User.create({
    name:            data.name,
    email:           data.email.toLowerCase(),
    password:        null,
    roleId:          data.roleId,
    partnerId,
    status:          'Inactive',
    isInvited:       true,
    inviteToken:     token,
    inviteExpiresAt: expiresAt,
    createdBy,
  });

  const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invite?token=${token}`;
  await sendInvitationEmail(user.email, user.name, inviteUrl);

  return getById(user._id);
};

// ─── Accept invite ────────────────────────────────────────────────────────────
const acceptInvite = async (token, password) => {
  const user = await User.findOne({
    inviteToken:     token,
    inviteExpiresAt: { $gt: new Date() },
    isDeleted:       false,
  });
  if (!user) throw { status: 400, message: 'Invitation link is invalid or has expired' };

  user.password        = await bcrypt.hash(password, 12);
  user.status          = 'Active';
  user.inviteToken     = null;
  user.inviteExpiresAt = null;
  await user.save();

  invalidateUser(user._id); // clear any cached session for this user
  return getById(user._id);
};

// ─── Resend invite ────────────────────────────────────────────────────────────
const resendInvite = async (id) => {
  const user = await User.findOne({ _id: id, isDeleted: false, isInvited: true });
  if (!user) throw { status: 404, message: 'Invited user not found' };
  if (user.password) throw { status: 400, message: 'User has already accepted their invitation' };

  const token = crypto.randomBytes(32).toString('hex');
  user.inviteToken     = token;
  user.inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invite?token=${token}`;
  await sendInvitationEmail(user.email, user.name, inviteUrl);
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const user = await User.findOne({ _id: id, isDeleted: false });
  if (!user) throw { status: 404, message: 'User not found' };

  if (data.email && data.email.toLowerCase() !== user.email) {
    const exists = await User.findOne({ email: data.email.toLowerCase(), _id: { $ne: id } });
    if (exists) throw { status: 400, message: 'Email already exists' };
    user.email = data.email.toLowerCase();
  }

  if (data.name)   user.name   = data.name;
  if (data.roleId !== undefined || data.partnerId !== undefined) {
    const roleId = data.roleId || user.roleId;
    const roleChanged = data.roleId && String(data.roleId) !== String(user.roleId);
    const wanted = data.partnerId !== undefined ? (data.partnerId || null) : (roleChanged ? null : user.partnerId);
    user.partnerId = await resolvePartnerId(roleId, wanted);
    user.roleId = roleId;
  }
  if (data.status) user.status = data.status;
  user.updatedBy = updatedBy;
  await user.save();

  // Invalidate cache — next request will re-fetch updated user+role
  invalidateUser(id);

  return getById(user._id);
};

// ─── Soft delete ──────────────────────────────────────────────────────────────
const softDelete = async (id, deletedBy) => {
  const user = await User.findOne({ _id: id, isDeleted: false });
  if (!user) throw { status: 404, message: 'User not found' };
  if (String(user._id) === String(deletedBy)) throw { status: 400, message: 'Cannot delete your own account' };

  user.isDeleted = true;
  user.deletedAt = new Date();
  user.updatedBy = deletedBy;
  await user.save();

  // Invalidate cache so deleted user can't use cached session
  invalidateUser(id);
};

module.exports = { list, getById, create, inviteUser, acceptInvite, resendInvite, update, softDelete };
