'use strict';

// BK-05: move a Layer 1 or Layer 2 booking to another voyage of the same round (Pending / Confirmed only).
// The target must run the booking's own POL then POD (same check as create, `checkChosenVoyage`); the round must be open;
// ports and everything else stay as they are. The audit entry (old doc -> new doc) is written by the audit middleware.
const mongoose = require('mongoose');
const lock = require('../rounds/roundLock');
const Voyage = require('../voyages/voyage.model');
const Booking = require('./booking.model');
const ManualBooking = require('./manualBooking.model');
const { resolveVoyage } = require('./bookingVoyage.service');
const { moveError } = require('./moveRules.logic');
const { invalidateRoundCache } = require('../capacity/capacity.service');

const move = async (Model, modelName, id, targetVoyageId, updatedBy, { isPartnerUser = false } = {}) => {
  if (!mongoose.isValidObjectId(String(targetVoyageId || ''))) throw { status: 400, message: 'A valid target voyage is required' };
  await lock.assertDocRoundOpen(modelName, id);
  const doc = await Model.findById(id);
  if (!doc) throw { status: 404, message: 'Booking not found' };

  const [cur, target] = await Promise.all([
    Voyage.findById(doc.voyageId).select('roundId').lean(),
    Voyage.findById(targetVoyageId).select('roundId').lean(),
  ]);
  if (!target) throw { status: 404, message: 'Target voyage not found' };
  const err = moveError({
    status: doc.status, currentVoyageId: doc.voyageId, targetVoyageId,
    currentRoundId: cur?.roundId, targetRoundId: target.roundId, isPartnerUser,
  });
  if (err) throw err;

  // the target voyage must run this booking's own POL then POD, and be bookable (not Cancelled / Completed)
  const { voyage, polLegKey, podLegKey } = await resolveVoyage({
    roundId: target.roundId, polId: doc.polId, podId: doc.podId,
    polLegKey: doc.polLegKey, podLegKey: doc.podLegKey, voyageId: targetVoyageId,
  });

  doc.voyageId = voyage._id;
  doc.polLegKey = polLegKey || doc.polLegKey || null;
  doc.podLegKey = podLegKey || doc.podLegKey || null;
  doc.updatedBy = updatedBy;
  await doc.save();
  invalidateRoundCache(target.roundId); // capacity is per voyage: both voyages are in this round
  return doc._id;
};

const moveBooking = (id, targetVoyageId, updatedBy, opts) => move(Booking, 'Booking', id, targetVoyageId, updatedBy, opts);
const moveManualBooking = (id, targetVoyageId, updatedBy, opts) => move(ManualBooking, 'ManualBooking', id, targetVoyageId, updatedBy, opts);

module.exports = { moveBooking, moveManualBooking };
