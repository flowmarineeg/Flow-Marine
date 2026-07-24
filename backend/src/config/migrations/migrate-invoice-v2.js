'use strict';

/**
 * migrate-invoice-v2.js — Sprint 033
 *
 * One-time, idempotent migration from the pre-Sprint-033 Invoice shape
 * (bookingId + amount, one booking per invoice) to the v2 shape
 * (lineItems[] snapshot array + totalAmount/paidAmount).
 *
 * Ownership of the booking↔invoice relationship is Invoice-side only
 * (Invoice.lineItems) — this migration writes NOTHING back to Booking.
 *
 * Idempotent: skipped for any invoice that already has a `lineItems` array
 * (re-running after a partial run, or against an already-migrated DB, is
 * safe and a no-op).
 *
 * NOT auto-run from server.js or seed.js — run manually:
 *   node src/config/migrations/migrate-invoice-v2.js
 *
 * File lives at: src/config/migrations/  — paths up to src/ require ../../
 */

const connectDB = require('../db');
const logger    = require('../../utils/logger');

const migrate = async () => {
  const Invoice = require('../../modules/invoices/invoice.model');
  const Payment = require('../../modules/invoices/payment.model');
  const Booking = require('../../modules/bookings/booking.model');
  const Voyage  = require('../../modules/voyages/voyage.model');
  const Round   = require('../../modules/rounds/round.model');

  // Raw driver access — the v2 Mongoose model no longer declares
  // bookingId/amount, but .lean()-free raw find() against the native
  // collection still returns whatever legacy fields exist in the documents.
  const legacyRows = await Invoice.collection.find({ lineItems: { $exists: false } }).toArray();

  if (!legacyRows.length) {
    logger.info('[Migration] migrate-invoice-v2: no legacy invoices found — nothing to do');
    return;
  }

  let migrated = 0;
  let skippedMissingBooking = 0;

  for (const row of legacyRows) {
    const booking = row.bookingId ? await Booking.findById(row.bookingId).lean() : null;
    if (!booking) {
      logger.error(`[Migration] migrate-invoice-v2: invoice ${row.invoiceNumber} references a missing booking — skipped`);
      skippedMissingBooking++;
      continue;
    }

    const voyage = await Voyage.findById(booking.voyageId)
      .populate('polId', 'name')
      .populate('podId', 'name')
      .lean();
    const round = voyage?.roundId ? await Round.findById(voyage.roundId).select('roundNumber').lean() : null;

    const lineItem = {
      bookingId:       booking._id,
      bookingNumber:   booking.bookingNumber,
      containerNumber: booking.containerNumber,
      voyageId:        voyage?._id || null,
      voyageNumber:    voyage?.voyageNumber || null,
      roundId:         round?._id || null,
      roundNumber:     round?.roundNumber || null,
      polName:         voyage?.polId?.name || null,
      podName:         voyage?.podId?.name || null,
      shipper:         booking.shipper || null,
      consignee:       booking.consignee || null,
      commodity:       booking.commodity || null,
      freightAmount:   row.amount,
      orphaned:        false,
      orphanedAt:      null,
      orphanedReason:  null,
    };

    const isPaid     = row.status === 'Paid';
    const totalAmount = row.amount;
    const paidAmount  = isPaid ? totalAmount : 0;

    await Invoice.collection.updateOne(
      { _id: row._id },
      {
        $set: {
          invoiceType: 'Booking',
          lineItems:   [lineItem],
          totalAmount,
          paidAmount,
        },
        $unset: { bookingId: '', amount: '' },
      }
    );

    if (isPaid) {
      const existingPayment = await Payment.exists({ invoiceId: row._id });
      if (!existingPayment) {
        await Payment.create({
          invoiceId:   row._id,
          agentId:     row.agentId,
          allocations: [{ bookingId: booking._id, amount: totalAmount }],
          amount:      totalAmount,
          paymentDate: row.updatedAt || new Date(),
          method:      'Other',
          notes:       'Backfilled — pre-migration paid invoice (Sprint 033 migrate-invoice-v2)',
        });
      }
    }

    migrated++;
  }

  logger.info(`[Migration] migrate-invoice-v2: ${migrated} invoice(s) migrated, ${skippedMissingBooking} skipped (missing booking)`);
};

if (require.main === module) {
  connectDB()
    .then(() => migrate())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(`[Migration] migrate-invoice-v2 failed: ${err.message}`);
      process.exit(1);
    });
}

module.exports = migrate;
