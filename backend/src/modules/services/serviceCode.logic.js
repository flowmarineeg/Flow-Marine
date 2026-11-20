'use strict';

// RV-40: the liner service code is locked once a round uses the service. Pure rule (no DB).

/** True when `incoming` is a real change of the stored code (codes are compared case-insensitively; blank = no change). */
const codeChanged = (existing, incoming) => {
  if (incoming === undefined || incoming === null || String(incoming).trim() === '') return false;
  return String(incoming).trim().toUpperCase() !== String(existing || '').trim().toUpperCase();
};

/** Refusal message, or null when the code may change (no round uses the service). */
const lockedMessage = (code, rounds) =>
  rounds > 0
    ? `Cannot change the code of service ${code}: ${rounds} round${rounds === 1 ? '' : 's'} already use it. The service name can still be edited.`
    : null;

module.exports = { codeChanged, lockedMessage };
