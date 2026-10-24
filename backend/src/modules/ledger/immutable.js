'use strict';

const AppError = require('../../utils/AppError');

// R3 — ledger documents are append-only. Registered on the schema so any
// Model-level update/delete (e.g. from a future careless service) throws.
const OPS = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
];

const immutableError = () =>
  new AppError(409, 'Ledger records are immutable — post a reversing entry instead', 'LEDGER_IMMUTABLE');

const makeImmutable = (schema) => {
  OPS.forEach((op) => schema.pre(op, function () { throw immutableError(); }));
  schema.pre('deleteOne', { document: true, query: false }, function () { throw immutableError(); });
  schema.pre('save', function () { if (!this.isNew) throw immutableError(); });
};

module.exports = { makeImmutable };
