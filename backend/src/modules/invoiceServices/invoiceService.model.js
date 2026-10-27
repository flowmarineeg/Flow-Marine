'use strict';

const mongoose = require('mongoose');
const { SERVICE_STATUS, SERVICE_APPLICABILITY } = require('../../config/constants');

// Master data 11.6 (owner 2026-10-27): the services printed on invoices. No price, no category.
// Not the liner Service (rounds/routes) - that one lives under Operations -> Routes.
const invoiceServiceSchema = new mongoose.Schema(
  {
    serviceName:      { type: String, required: true, unique: true, trim: true, maxlength: 100 }, // name displayed on invoices
    applicability:    { type: String, enum: SERVICE_APPLICABILITY, required: true },
    isTaxable:        { type: Boolean, required: true },
    revenueAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    status:           { type: String, enum: SERVICE_STATUS, default: 'Active' },
    createdBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InvoiceService', invoiceServiceSchema);
