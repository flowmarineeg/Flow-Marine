'use strict';

const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, default: '' },
    isSystem: { type: Boolean, default: false },   // true = cannot be deleted
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

roleSchema.index({ name: 1 }, { unique: true });
roleSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Role', roleSchema);
