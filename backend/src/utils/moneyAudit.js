'use strict';

const AuditLog = require('../modules/auditLogs/auditLog.model');
const logger = require('./logger');

/**
 * Sprint053 D9-A - audit helper for money events. The generic auditLogger
 * middleware is untouched (it only logs successes, with no reason). Money
 * services call this explicitly, for successes AND refusals:
 *   recordMoneyEvent({ user, module, event, recordId, before, after, reason, success, error })
 * Fire-and-forget: a failed audit write is logged, never thrown.
 */
const recordMoneyEvent = ({ user, module, event, recordId = null, recordNumber = null, before = null, after = null, reason = null, success = true, error = null }) => {
  setImmediate(async () => {
    try {
      if (!user?._id) return;
      await AuditLog.create({
        userId: user._id, userEmail: user.email || '', action: before ? 'UPDATE' : 'CREATE', module,
        recordId, recordNumber, oldValues: before,
        newValues: { _event: event, _success: !!success, _reason: reason || null, _error: error || null, ...(after || {}) },
      });
    } catch (e) {
      logger.error(`[moneyAudit] ${e.message}`);
    }
  });
};

module.exports = { recordMoneyEvent };
