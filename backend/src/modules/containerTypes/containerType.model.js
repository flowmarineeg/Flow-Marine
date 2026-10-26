'use strict';

const mongoose = require('mongoose');
const { CONTAINER_SIZES, CONTAINER_TYPES } = require('../../config/constants');

const containerTypeSchema = new mongoose.Schema(
  {
    code:        { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    isoCode:     { type: String, unique: true, sparse: true, trim: true, uppercase: true, maxlength: 4 }, // ISO 6346 size/type code e.g. 22G1
    description: { type: String, trim: true, default: null },
    size:        { type: String, enum: CONTAINER_SIZES, required: true },
    type:        { type: String, enum: CONTAINER_TYPES, required: true },
    // Informational + export only: derived from `size` on every save. The capacity engine still uses teuResolver (rule R10).
    teuFactor:   { type: Number, default: 1 },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// code uniqueness enforced inline

module.exports = mongoose.model('ContainerType', containerTypeSchema);
