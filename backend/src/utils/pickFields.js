'use strict';

// Sprint049 (audit M8) — mass-assignment guard.
// Update/create services used to copy the whole request body onto a document
// (`Object.assign(doc, { ...data })`). express-validator only checks the
// fields it knows about; it does not strip the rest, so a caller could write
// any schema field (including server-owned ones). This keeps only paths the
// Mongoose schema declares, minus bookkeeping fields and any extra `blocked`
// names the caller lists.
const ALWAYS_BLOCKED = new Set([
  '_id', '__v', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'isDeleted', 'deletedAt',
]);

const pickFields = (Model, data, blocked = []) => {
  const extra = new Set(blocked);
  const out = {};
  for (const key of Object.keys(data || {})) {
    if (ALWAYS_BLOCKED.has(key) || extra.has(key)) continue;
    if (Model.schema.path(key)) out[key] = data[key];
  }
  return out;
};

module.exports = pickFields;
