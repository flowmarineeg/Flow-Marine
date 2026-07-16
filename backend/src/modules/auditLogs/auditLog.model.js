'use strict';

const mongoose = require('mongoose');
const { AUDIT_ACTIONS } = require('../../config/constants');

const auditLogSchema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail:    { type: String, default: '' },
    action:       { type: String, enum: AUDIT_ACTIONS, required: true },
    module:       { type: String, required: true },
    recordId:     { type: mongoose.Schema.Types.ObjectId, default: null },
    recordNumber: { type: String, default: null },
    oldValues:    { type: mongoose.Schema.Types.Mixed, default: null },
    newValues:    { type: mongoose.Schema.Types.Mixed, default: null },
    ipAddress:    { type: String, default: null },
    userAgent:    { type: String, default: null },
    timestamp:    { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// ── Compound indexes — Sprint020 DB-001 ───────────────────────────────────────
auditLogSchema.index({ module: 1,  timestamp: -1 }); // module-filtered log view
auditLogSchema.index({ userId: 1,  timestamp: -1 }); // user activity view
auditLogSchema.index({ recordId: 1 });
auditLogSchema.index({ action: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
