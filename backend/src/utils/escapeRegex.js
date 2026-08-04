'use strict';

// Escapes every regex metacharacter so a value can be safely interpolated
// into a MongoDB `$regex` filter without behaving as a pattern itself.
// Without this, any authenticated user (including read-only roles) can
// submit a catastrophic-backtracking pattern (e.g. "(a+)+$") as a plain
// `?search=` query param and tie up the Node event loop — a single-instance
// deployment has no isolation from this. Reused by every list endpoint that
// builds a `{ $regex: search, $options: 'i' }` filter from user input.
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };
