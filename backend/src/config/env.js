'use strict';

const required = [
  'MONGODB_URI',
  'JWT_SECRET',
  'SMTP_EMAIL',
  'SMTP_APP_PASSWORD',
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
