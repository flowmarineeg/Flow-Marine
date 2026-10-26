'use strict';

// Pure expense-type rules (unit-tested): operational level <-> expense scope, PDA workflow, required mappings.
const OPERATIONAL_LEVELS = ['ROUND_LEVEL', 'VOYAGE_LEVEL', 'PORT_LEVEL'];

// Expense scope (derived from which of roundId / voyageId / portId are set) each level accepts.
//   ROUND_LEVEL  - whole round (charter hire, bunkers, canal, insurance)
//   VOYAGE_LEVEL - one voyage (voyage-intermediary commission); a port-scoped entry is still voyage-bound, so allowed
//   PORT_LEVEL   - one port call of a voyage (Port DA, THC, stevedoring, port-agent fees)
const ALLOWED_SCOPES = {
  ROUND_LEVEL: ['Round'],
  VOYAGE_LEVEL: ['Voyage', 'Port'],
  PORT_LEVEL: ['Port'],
};

const LEVEL_LABEL = { ROUND_LEVEL: 'Round-level', VOYAGE_LEVEL: 'Voyage-level', PORT_LEVEL: 'Port-level' };

const scopeAllowed = (level, scope) => (ALLOWED_SCOPES[level || 'VOYAGE_LEVEL'] || []).includes(scope);

/** Error message when an expense scope does not fit the type's level, else null. */
const scopeError = (type, scope) => {
  const level = type.operationalLevel || 'VOYAGE_LEVEL';
  if (scopeAllowed(level, scope)) return null;
  return `"${type.name}" is a ${LEVEL_LABEL[level]} expense type and cannot be recorded at ${scope} scope (allowed: ${ALLOWED_SCOPES[level].join(' / ')})`;
};

/** kind to use on create: types that require a PDA start as one; an explicit FDA for such a type is refused. */
const resolveKind = (type, requestedKind) => {
  if (!type.requiresPda) return { kind: requestedKind === 'PDA' ? 'PDA' : 'FDA', error: null };
  if (requestedKind === 'FDA') return { kind: null, error: `"${type.name}" requires a provisional estimate (PDA) first; the final (FDA) is created from it` };
  return { kind: 'PDA', error: null };
};

/** Required mapping fields on the merged type record. Returns missing field names. */
const missingMappings = (t) => {
  const missing = [];
  if (!t.operationalLevel) missing.push('operationalLevel');
  if (!t.expenseAccountId) missing.push('expenseAccountId');
  if (t.requiresPda && !t.accrualAccountId) missing.push('accrualAccountId');
  return missing;
};

/** Backfill: level from the scopes the type's existing expenses already use (most common wins; ties -> narrower). */
const levelFromScopes = (counts) => {
  const order = ['Port', 'Voyage', 'Round']; // tie-break preference
  let best = null;
  for (const s of order) if ((counts[s] || 0) > 0 && (best === null || counts[s] > counts[best])) best = s;
  return { Round: 'ROUND_LEVEL', Voyage: 'VOYAGE_LEVEL', Port: 'PORT_LEVEL' }[best] || 'VOYAGE_LEVEL';
};

module.exports = { OPERATIONAL_LEVELS, ALLOWED_SCOPES, LEVEL_LABEL, scopeAllowed, scopeError, resolveKind, missingMappings, levelFromScopes };
