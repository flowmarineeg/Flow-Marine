'use strict';

const mongoose = require('mongoose');
const { CONTAINER_SIZES, CONTAINER_TYPES } = require('../../config/constants');

const containerTypeSchema = new mongoose.Schema(
  {
    code:        { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    description: { type: String, trim: true, default: null },
    size:        { type: String, enum: CONTAINER_SIZES, required: true },
    type:        { type: String, enum: CONTAINER_TYPES, required: true },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// code uniqueness enforced inline

module.exports = mongoose.model('ContainerType', containerTypeSchema);
