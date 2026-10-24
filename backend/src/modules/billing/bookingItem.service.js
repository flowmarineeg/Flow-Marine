'use strict';

const Booking = require('../bookings/booking.model');
const Voyage = require('../voyages/voyage.model');
const Invoice = require('../invoices/invoice.model');
const logger = require('../../utils/logger');
const { BookingItem } = require('./billing.models');
const { groupBookingsIntoItems } = require('./billing.logic');

/**
 * Recompute the BookingItems of the given voyages from their Final Loading
 * bookings (D1-A). Locked items (owned by a live invoice line) are never
 * touched - a later quantity change on an invoiced item is a credit/debit
 * note matter, not a silent edit. Bookings still sitting on a legacy (V1)
 * non-cancelled invoice are excluded so nothing can be billed twice.
 */
const syncForVoyages = async (voyageIds) => {
  const ids = [...new Set(voyageIds.map(String))];
  if (!ids.length) return;
  const voyages = await Voyage.find({ _id: { $in: ids } }).select('roundId').lean();
  const roundOf = new Map(voyages.map((v) => [String(v._id), v.roundId]));

  const bookings = await Booking.find({ voyageId: { $in: ids }, status: 'Final Loading' })
    .select('agentId billToPartyId voyageId containerTypeId freightRate status').lean();

  const v1Claimed = new Set();
  if (bookings.length) {
    const rows = await Invoice.find(
      { v2: { $ne: true }, status: { $ne: 'Cancelled' }, 'lineItems.bookingId': { $in: bookings.map((b) => b._id) } },
      { 'lineItems.bookingId': 1 }
    ).lean();
    rows.forEach((inv) => inv.lineItems.forEach((li) => v1Claimed.add(String(li.bookingId))));
  }

  const groups = groupBookingsIntoItems(bookings.filter((b) => !v1Claimed.has(String(b._id))));
  const keyOf = (g) => [g.billToAgentId, g.voyageId, g.containerTypeId, g.freightRate].join('|');
  const wanted = new Map(groups.map((g) => [keyOf(g), g]));

  const existing = await BookingItem.find({ voyageId: { $in: ids } });
  for (const it of existing) {
    const k = keyOf({ billToAgentId: String(it.billToAgentId), voyageId: String(it.voyageId), containerTypeId: String(it.containerTypeId), freightRate: it.freightRate });
    const g = wanted.get(k);
    if (it.locked) { wanted.delete(k); continue; }
    if (!g) { await BookingItem.deleteOne({ _id: it._id }); continue; }
    it.loadedQty = g.loadedQty;
    it.bookingIds = g.bookingIds;
    await it.save();
    wanted.delete(k);
  }
  for (const g of wanted.values()) {
    await BookingItem.create({
      billToAgentId: g.billToAgentId, voyageId: g.voyageId, roundId: roundOf.get(g.voyageId) || null,
      containerTypeId: g.containerTypeId, freightRate: g.freightRate,
      loadedQty: g.loadedQty, bookingIds: g.bookingIds,
    });
  }
};

/** Hook for booking/import mutation sites: never throws. */
const scheduleSync = ({ voyageIds = [], roundId = null } = {}) => {
  setImmediate(async () => {
    try {
      let ids = voyageIds;
      if (roundId) ids = (await Voyage.find({ roundId }).select('_id').lean()).map((v) => v._id);
      await syncForVoyages(ids);
    } catch (e) {
      logger.error(`[billing] item sync failed: ${e.message}`);
    }
  });
};

/** Items a wizard can invoice: sync first, then unlocked items for the scope. */
const listEligible = async ({ billToAgentId, voyageId, roundId }) => {
  if (!billToAgentId) return [];
  let voyageIds;
  if (voyageId) voyageIds = [voyageId];
  else if (roundId) voyageIds = (await Voyage.find({ roundId }).select('_id').lean()).map((v) => v._id);
  else return [];
  await syncForVoyages(voyageIds);
  return BookingItem.find({ billToAgentId, voyageId: { $in: voyageIds }, locked: false, loadedQty: { $gt: 0 } })
    .populate('containerTypeId', 'code size type')
    .populate({ path: 'voyageId', select: 'voyageNumber voyageName roundId', populate: { path: 'roundId', select: 'roundNumber' } })
    .sort({ voyageId: 1 }).lean();
};

module.exports = { syncForVoyages, scheduleSync, listEligible };
