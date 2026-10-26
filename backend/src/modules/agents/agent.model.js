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
    agentName: { type: String, required: true, trim: true, maxlength: 100 }, // Agent Name (EN)
    nameAr:    { type: String, trim: true, default: null, maxlength: 100 },
    defaultCurrency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: 'USD' },
    // Port / Location linked to the Locations master (the free-text country/city/port below stay for older records)
    portId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Port', default: null },
    countryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', default: null },
    cityId:    { type: mongoose.Schema.Types.ObjectId, ref: 'City', default: null },
    country:   { type: String, trim: true, default: null },
    city:      { type: String, trim: true, default: null },
    port:      { type: String, trim: true, default: null },
    address:   { type: String, trim: true, default: null },
    contacts:  { type: [contactSchema], default: [] },
    status:    { type: String, enum: AGENT_STATUS, default: 'Active' },
    // Sprint 052 V2 (additive). Old agents read as a plain commercial 'Agent'.
    ledgerVersion: { type: Number, default: 0 }, // bumped to serialise agent cash movements (audit H2)
    partyType: { type: String, enum: ['Agent', 'DirectLine'], default: 'Agent' }, // DirectLine: invoices + statement only, no offset
    roles:     { type: [{ type: String, enum: ['Commercial', 'Port'] }], default: [] },
    creditDays:{ type: Number, min: 0, max: 365, default: null }, // no longer shown on the master (master data 11.3): kept for the invoice due-date default
    receivableAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
    payableAccountId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// agentCode uniqueness enforced inline (sparse — allows multiple nulls)
agentSchema.index({ status: 1 });

module.exports = mongoose.model('Agent', agentSchema);
