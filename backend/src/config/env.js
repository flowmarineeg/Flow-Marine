'use strict';

// SMTP is only mandatory in production; locally, invitation emails simply fail with a clear error (F-11).
const required = [
  'MONGODB_URI',
  'JWT_SECRET',
  ...(process.env.NODE_ENV === 'production' ? ['SMTP_EMAIL', 'SMTP_APP_PASSWORD'] : []),
];

const validate = () => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[ENV] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // JWT_SECRET must be strong enough to be secure
  if (process.env.JWT_SECRET.length < 32) {
    console.error('[ENV] JWT_SECRET must be at least 32 characters long');
    process.exit(1);
  }
};

module.exports = { validate };

/**
 * ENABLE_CAPACITY_ENFORCEMENT (Sprint 022)
 * Controls pre-flight capacity checks on booking create and import preview.
 *
 * Values:
 *   unset / '' / 'off'  → disabled (default): no capacity check, zero overhead
 *   'warn'              → check runs; overbooked bookings are created with a
 *                         warning in the response body (capacityWarning field)
 *   'strict'            → check runs; overbooked bookings are REJECTED with 400
 *
 * Set in your .env file:
 *   ENABLE_CAPACITY_ENFORCEMENT=warn
 */
const capacityEnforcement = () => {
  const val = (process.env.ENABLE_CAPACITY_ENFORCEMENT || '').trim().toLowerCase();
  if (val === 'strict') return 'strict';
  if (val === 'warn')   return 'warn';
  return null; // disabled
};

module.exports = { validate, capacityEnforcement };
