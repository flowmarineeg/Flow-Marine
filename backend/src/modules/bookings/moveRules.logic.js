'use strict';

// BK-05: moving a booking to another voyage of the SAME round. Pure rules (no DB); the service does the loading and writing.
// Only Pending / Confirmed bookings move: Final Loading ones are on the manifest (and may be invoiced), Cancelled ones are history.
const MOVABLE = Object.freeze(['Pending', 'Confirmed']);

/** Returns null when the move is allowed, else { status, message, code }. */
const moveError = ({ status, currentVoyageId, targetVoyageId, currentRoundId, targetRoundId, isPartnerUser = false }) => {
  if (isPartnerUser) return { status: 403, message: 'Partner users cannot move bookings', code: 'MOVE_FORBIDDEN' };
  if (!MOVABLE.includes(status)) return { status: 400, message: `Only Pending or Confirmed bookings can be moved (this one is ${status})`, code: 'MOVE_STATUS' };
  if (!targetVoyageId) return { status: 400, message: 'The target voyage is required', code: 'MOVE_TARGET' };
  if (String(currentVoyageId) === String(targetVoyageId)) return { status: 400, message: 'The booking is already on this voyage', code: 'MOVE_SAME' };
  if (String(currentRoundId) !== String(targetRoundId)) return { status: 400, message: 'A booking can only be moved to another voyage of the same round', code: 'MOVE_ROUND' };
  return null;
};

module.exports = { MOVABLE, moveError };
