'use strict';

const mongoose = require('mongoose');

// Master data 11.3B. End customers / shippers - separate from Agents (port agents, commercial agents, direct lines).
const CUSTOMER_TYPES = ['Commercial Agent', 'NVOCC', 'Freight Forwarder'];

const { bankAccountSchema } = require('../../utils/bankAccounts');

const contactSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true, maxlength: 100 },
  title: { type: String, trim: true, default: null, maxlength: 100 },
  email: { type: String, trim: true, lowercase: true, default: null },
  phone: { type: String, trim: true, default: null, maxlength: 40 },
}, { _id: true });

const customerSchema = new mongoose.Schema(
  {
    customerCode: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    customerName: { type: String, required: true, trim: true, maxlength: 120 }, // Customer Name (EN)
    nameAr:       { type: String, trim: true, default: null, maxlength: 120 },
    customerType: { type: String, enum: CUSTOMER_TYPES, required: true },
    country:      { type: String, trim: true, default: null, maxlength: 80 },
    address:      { type: String, trim: true, default: null, maxlength: 300 },
    registrationNumber: { type: String, trim: true, default: null, maxlength: 60 },
    taxId:        { type: String, trim: true, default: null, maxlength: 60 },
    contacts:     { type: [contactSchema], default: [] },
    bankAccounts: { type: [bankAccountSchema], default: [] },
    defaultCurrency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: 'USD' },
    arAccountId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null }, // accounting mapping (receivable)
    status:       { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

customerSchema.index({ customerType: 1, status: 1 });
customerSchema.index({ customerName: 1 });

module.exports = mongoose.model('Customer', customerSchema);
module.exports.CUSTOMER_TYPES = CUSTOMER_TYPES;
