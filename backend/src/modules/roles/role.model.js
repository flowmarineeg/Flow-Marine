'use strict';

const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, default: '' },
    isSystem: { type: Boolean, default: false },   // true = cannot be deleted
    isPartnerRole: { type: Boolean, default: false }, // bookings sprint 2026-11-10: users of this role belong to a Partner and only reach their own bookings
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

roleSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);
