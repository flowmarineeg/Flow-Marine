'use strict';

const mongoose = require('mongoose');
const { USER_STATUS } = require('../../config/constants');

const userSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true, maxlength: 100 },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:  { type: String, default: null },          // null until set (invited users)
    roleId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    status:    { type: String, enum: USER_STATUS, default: 'Active' },
    lastLogin: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },      // Sprint049: bumped on password change/reset to revoke old JWTs

    // Invitation flow
    inviteToken:     { type: String, default: null },
    inviteExpiresAt: { type: Date,   default: null },
    isInvited:       { type: Boolean, default: false },

    // Password reset flow
    resetToken:          { type: String, default: null },
    resetTokenExpiresAt: { type: Date,   default: null },

    // Soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date,   default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// email uniqueness enforced inline via unique:true on the field
userSchema.index({ roleId: 1 });
userSchema.index({ status: 1 });
userSchema.index({ isDeleted: 1 });
userSchema.index({ inviteToken: 1 }, { sparse: true });
userSchema.index({ resetToken: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
