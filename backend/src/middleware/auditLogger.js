'use strict';

const AuditLog = require('../modules/auditLogs/auditLog.model');
const logger   = require('../utils/logger');

/**
 * Audit logger middleware — Sprint020 PERF-003
 *
 * Previous: overrode res.json as async, awaited AuditLog.create before sending.
 *   → Every mutation delayed by audit write latency.
 *
 * Now: uses res.on('finish') to write the audit log AFTER the response is sent.
 *   → Response is never delayed. AuditLog write is fully fire-and-forget.
 *   → If AuditLog.create fails, the error is logged but never reaches the client.
 *
 * Attach oldDoc to req.auditOldDoc in the controller before calling next()
 * for update operations to capture before/after diff.
 */
const auditLogger = (module) => (req, res, next) => {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) return next();

  // Capture the response body for logging after it's sent.
  // We monkey-patch res.json only to read the body — we call originalJson immediately
  // so the response is never held back.
  let capturedBody = null;
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    capturedBody = body;         // capture for use in finish handler
    return originalJson(body);   // send immediately — no await, no delay
  };

  // Write the audit log after the response has fully been sent
  res.on('finish', () => {
    if (!capturedBody?.success || !req.user) return;

    setImmediate(async () => {
      try {
        const actionMap = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };
        const action     = actionMap[req.method];
        const recordData = capturedBody?.data;

        const strip = (obj) => {
          if (!obj) return null;
          const { password, resetToken, inviteToken, resetTokenExpiresAt, inviteExpiresAt, ...safe } = obj;
          return safe;
        };

        await AuditLog.create({
          userId:       req.user._id,
          userEmail:    req.user.email,
          action,
          module,
          recordId:     recordData?._id || req.params?.id || null,
          recordNumber: recordData?.roundNumber   || recordData?.bookingNumber  ||
                        recordData?.invoiceNumber || recordData?.voyageNumber   ||
                        recordData?.vesselCode    || recordData?.agentCode      || null,
          oldValues:    req.auditOldDoc ? strip(req.auditOldDoc) : null,
          newValues:    recordData      ? strip(recordData)      : null,
          ipAddress:    req.ip || req.connection?.remoteAddress || null,
          userAgent:    req.headers['user-agent'] || null,
          timestamp:    new Date(),
        });
      } catch (err) {
        logger.error(`[AuditLog] Failed to write log: ${err.message}`);
      }
    });
  });

  next();
};

module.exports = auditLogger;
