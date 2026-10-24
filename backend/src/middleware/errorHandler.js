'use strict';

const logger = require('../utils/logger');

/**
 * Global error handler — Sprint020 ARCH-002
 *
 * Handles both:
 *   - AppError instances (isOperational = true, statusCode set)
 *   - Raw { status, message } throws (legacy — still safe via the statusCode fallback)
 *   - Mongoose / JWT / Cast errors
 *   - Unexpected programmer errors (statusCode 500)
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Log every error with method + path for traceability
  logger.error(`[${req.method} ${req.originalUrl}] ${err.message}`);

  // ── Mongoose validation error ─────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field:   e.path,
      message: e.message,
    }));
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }

  // ── MongoDB duplicate key ─────────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      errors:  [],
    });
  }

  // ── JWT errors ────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token', errors: [] });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired', errors: [] });
  }

  // ── Invalid ObjectId ──────────────────────────────────────────────────────
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({ success: false, message: 'Invalid ID format', errors: [] });
  }

  // ── AppError / legacy {status} throws ────────────────────────────────────
  // AppError uses err.statusCode; legacy service throws use err.status
  const statusCode = err.statusCode || err.status || 500;
  const isClient   = statusCode >= 400 && statusCode < 500;

  // Never leak internal error details in production for 5xx errors
  const message = (isClient || process.env.NODE_ENV !== 'production')
    ? err.message
    : 'Internal server error';

  const body = { success: false, message, errors: [] };
  if (err.code && typeof err.code === 'string') body.code = err.code; // Sprint050 R7
  return res.status(statusCode).json(body);
};

module.exports = errorHandler;
