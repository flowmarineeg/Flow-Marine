'use strict';

const mongoose = require('mongoose');
const { MODULES } = require('../../config/constants');

const actionSchema = new mongoose.Schema(
  {
    create: { type: Boolean, default: false },
    read:   { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    import: { type: Boolean, default: false }, // Sprint019: booking bulk import
    export: { type: Boolean, default: false }, // Sprint019: per-module export
    view:   { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },
  },
  { _id: false }
);

const permissionSchema = new mongoose.Schema(
  {
    roleId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    module:  { type: String, required: true, enum: MODULES },
    actions: { type: actionSchema, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

permissionSchema.index({ roleId: 1, module: 1 }, { unique: true });

module.exports = mongoose.model('Permission', permissionSchema);
