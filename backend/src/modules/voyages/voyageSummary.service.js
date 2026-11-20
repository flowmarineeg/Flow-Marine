'use strict';

// GET /voyages/:id/summary. No new way of computing totals: TEU comes from the capacity engine (capacityLegs.logic through
// computeRoundCapacity), counts / freight / per-status TEU from bookingSummary.voyageStatusTotals; this file adds one small
// read-only invoiced aggregate and the latest tracking, and assembles the result with voyageSummary.logic (pure).
const mongoose = require('mongoose');
const Voyage = require('./voyage.model');
const TrackingHistory = require('../tracking/trackingHistory.model');
const Invoice = require('../invoices/invoice.model');
const { BookingItem, InvoiceLine } = require('../billing/billing.models');
const { computeRoundCapacity } = require('../capacity/capacity.service');
const { voyageStatusTotals } = require('../bookings/bookingSummary.service');
const { BASE_CURRENCY } = require('../../utils/money');
const logic = require('./voyageSummary.logic');

// Issued invoices only (a Draft or Cancelled invoice is not revenue); notes are not netted per voyage (they carry no voyage).
const ISSUED = ['Issued', 'Partially Paid', 'Paid', 'Overdue'];

/**
 * Invoiced revenue of one voyage, gross before credit/debit notes: live invoice lines of issued invoices, reached through
 * BookingItem.voyageId (always set). Invoice.voyageId and the ledger voyageId exist only for Voyage-type invoices.
 * Read-only; money code is not touched.
 */
const invoicedForVoyage = async (voyageId) => {
  const itemIds = await BookingItem.find({ voyageId }).distinct('_id');
  if (!itemIds.length) return { amount: 0, invoices: 0 };
  const lines = await InvoiceLine.find({ bookingItemId: { $in: itemIds }, cancelled: false, currency: BASE_CURRENCY })
    .select('invoiceId amountMinor').lean();
  if (!lines.length) return { amount: 0, invoices: 0 };
  const invoices = await Invoice.find({
    _id: { $in: [...new Set(lines.map((l) => String(l.invoiceId)))] },
    status: { $in: ISSUED }, docKind: { $nin: ['CreditNote', 'DebitNote'] },
  }).select('_id').lean();
  const ok = new Set(invoices.map((i) => String(i._id)));
  const minor = lines.filter((l) => ok.has(String(l.invoiceId))).reduce((n, l) => n + (l.amountMinor || 0), 0);
  return { amount: minor / 100, invoices: ok.size };
};

const getSummary = async (id, { canSeeRevenue = false } = {}) => {
  if (!mongoose.isValidObjectId(String(id))) throw { status: 400, message: 'Invalid voyage id' };
  const voyage = await Voyage.findById(id)
    .select('voyageNumber voyageName direction status roundId portCalls')
    .populate('roundId', 'roundNumber roundName status closeStatus')
    .lean();
  if (!voyage) throw { status: 404, message: 'Voyage not found' };
  const round = voyage.roundId || {};
  const roundId = round._id || voyage.roundId;

  const warnings = [];
  let row = null;
  try {
    const cap = await computeRoundCapacity(roundId);
    row = (cap.voyages || []).find((v) => String(v.voyageId) === String(voyage._id)) || null; // a Cancelled voyage has no row
  } catch (e) {
    warnings.push({ code: 'CAPACITY_UNAVAILABLE', message: e?.message || 'Capacity could not be computed' });
  }

  const [totals, tracking, invoiced] = await Promise.all([
    voyageStatusTotals(voyage._id),
    TrackingHistory.find({ voyageId: voyage._id }).sort({ lastUpdate: 1 }).select('portId status lastUpdate').limit(500).lean(),
    canSeeRevenue ? invoicedForVoyage(voyage._id) : Promise.resolve(null),
  ]);

  const { nextPort, ports } = logic.nextPort({ calls: voyage.portCalls || [], voyageStatus: voyage.status, tracking });

  const summary = {
    voyage: {
      _id: voyage._id, voyageNumber: voyage.voyageNumber, voyageName: voyage.voyageName || null,
      direction: voyage.direction || null, status: voyage.status,
      roundId, roundNumber: round.roundNumber || null, roundName: round.roundName || null,
      roundStatus: round.status || null, closeStatus: round.closeStatus || null,
    },
    actions: logic.canBook({ voyageStatus: voyage.status, roundStatus: round.status, closeStatus: round.closeStatus }),
    bookings: logic.bookingsCard(totals.estimated, totals.operational, totals.allocation),
    teu: logic.teuCard(totals.estimated, totals.operational, row, totals.allocation),
    revenue: logic.revenueCard(totals.estimated, totals.operational, invoiced, totals.allocation),
    ports,
    nextPort,
    warnings,
  };
  return logic.shapeForPermissions(summary, canSeeRevenue);
};

module.exports = { getSummary, invoicedForVoyage };
