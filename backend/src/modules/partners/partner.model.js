'use strict';

const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema(
  {
    code:    { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    name:    { type: String, required: true, trim: true, maxlength: 120 },
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
