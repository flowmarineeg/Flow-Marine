'use strict';

const mongoose = require('mongoose');

const { bankAccountSchema } = require('../../utils/bankAccounts');

const contactSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true, maxlength: 100 },
  title: { type: String, trim: true, default: null, maxlength: 100 },
  email: { type: String, trim: true, lowercase: true, default: null },
  phone: { type: String, trim: true, default: null, maxlength: 40 },
}, { _id: true });

const bankSchema = new mongoose.Schema({
  bankName:         { type: String, trim: true, default: null, maxlength: 120 },
  bankAddress:      { type: String, trim: true, default: null, maxlength: 300 },
  usdAccountNumber: { type: String, trim: true, default: null, maxlength: 40 },
  usdIban:          { type: String, trim: true, uppercase: true, default: null, maxlength: 40 },
  swiftCode:        { type: String, trim: true, uppercase: true, default: null, maxlength: 11 },
}, { _id: false });

const partnerSchema = new mongoose.Schema(
  {
    code:    { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    name:    { type: String, required: true, trim: true, maxlength: 120 }, // Partner Name (EN)
    nameAr:  { type: String, trim: true, default: null, maxlength: 120 },
    country: { type: String, trim: true, default: null, maxlength: 80 },
    address: { type: String, trim: true, default: null, maxlength: 300 },
    registrationNumber: { type: String, trim: true, default: null, maxlength: 60 },
    taxId:   { type: String, trim: true, default: null, maxlength: 60 },
    baseCurrency: { type: String, trim: true, uppercase: true, default: 'USD', minlength: 3, maxlength: 3 },
    contacts: { type: [contactSchema], default: [] },
    bankAccounts: { type: [bankAccountSchema], default: [] }, // many bank details (2026-10-27)
    bank:     { type: bankSchema, default: () => ({}) },      // legacy single bank: read-only, copied into bankAccounts[0] by migrate:masterdata
    // Deprecated single contact: superseded by contacts[]. Kept readable until backfill-partner-contacts has run everywhere.
    contact: {
      person:  { type: String, trim: true, default: null },
      email:   { type: String, trim: true, lowercase: true, default: null },
      phone:   { type: String, trim: true, default: null },
      address: { type: String, trim: true, default: null },
    },
    status:    { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    notes:     { type: String, trim: true, default: null, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Partner', partnerSchema);
