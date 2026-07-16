'use strict';

const mongoose = require('mongoose');
const { AGENT_STATUS } = require('../../config/constants');

const contactSchema = new mongoose.Schema({
  contactPerson: { type: String, trim: true, default: null },
  mobile:        { type: String, trim: true, default: null },
  email:         { type: String, trim: true, lowercase: true, default: null },
  description:   { type: String, trim: true, default: null },
}, { _id: true });

const agentSchema = new mongoose.Schema(
  {
    agentCode: { type: String, unique: true, sparse: true, trim: true, uppercase: true, maxlength: 20, default: null },
    agentName: { type: String, required: true, trim: true, maxlength: 100 },
    country:   { type: String, trim: true, default: null },
    city:      { type: String, trim: true, default: null },
    port:      { type: String, trim: true, default: null },
    address:   { type: String, trim: true, default: null },
    contacts:  { type: [contactSchema], default: [] },
    status:    { type: String, enum: AGENT_STATUS, default: 'Active' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// agentCode uniqueness enforced inline (sparse — allows multiple nulls)
agentSchema.index({ status: 1 });
agentSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Agent', agentSchema);
