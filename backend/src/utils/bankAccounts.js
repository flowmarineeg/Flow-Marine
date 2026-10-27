'use strict';

// Repeatable bank-detail rows shared by Agents and Customers (master data 2026-10-27).
const mongoose = require('mongoose');
const { body } = require('express-validator');
const { isIban, isSwift } = require('./masterValidators');

const bankAccountSchema = new mongoose.Schema({
  bankName:         { type: String, required: true, trim: true, maxlength: 120 },
  swiftCode:        { type: String, trim: true, uppercase: true, default: null, maxlength: 11 },
  bankAddress:      { type: String, trim: true, default: null, maxlength: 300 },
  usdAccountNumber: { type: String, trim: true, default: null, maxlength: 40 },
  usdIban:          { type: String, trim: true, uppercase: true, default: null, maxlength: 34 },
}, { _id: true });

const nn = { nullable: true, checkFalsy: true };

/** express-validator rules for a `bankAccounts` array body field. */
const bankAccountRules = [
  body('bankAccounts').optional().isArray({ max: 20 }).withMessage('bankAccounts must be an array (max 20)'),
  body('bankAccounts.*.bankName').isString().trim().notEmpty().withMessage('Each bank detail needs a bank name').isLength({ max: 120 }),
  body('bankAccounts.*.swiftCode').optional(nn).custom(isSwift).withMessage('Invalid SWIFT code'),
  body('bankAccounts.*.usdIban').optional(nn).custom(isIban).withMessage('Invalid USD IBAN'),
  body('bankAccounts.*.usdAccountNumber').optional(nn).isString().trim().isLength({ max: 40 }),
  body('bankAccounts.*.bankAddress').optional(nn).isString().trim().isLength({ max: 300 }),
];

module.exports = { bankAccountSchema, bankAccountRules };
