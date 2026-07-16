'use strict';

/**
 * AppError — Sprint020 ARCH-002
 *
 * Replaces the ad-hoc `throw { status, message }` pattern used across all
 * service files. errorHandler already reads `err.statusCode`, so aligning
 * services to this class removes the manual catch-and-forward in controllers.
 *
 * Usage:
 *   throw new AppError(404, 'Booking not found');
 *   throw new AppError(400, 'POL and POD cannot be the same');
 *   throw new AppError(403, 'Insufficient permissions');
 */
class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode    = statusCode;
    this.isOperational = true;  // distinguishes known errors from programmer bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
