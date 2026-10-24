'use strict';

const mongoose = require('mongoose');

// Sprint050 P7 — schema only; accrual logic arrives in Sprint 051 (R7).
// Independent of the invoice: cancelling an invoice never cancels this row.
const oid = (ref) => ({ type: mongoose.Schema.Types.ObjectId, ref, default: null });

const agentCommissionSchema = new mongoose.Schema(
  {
    agentId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
    roundId:       oid('Round'),
    voyageId:      oid('Voyage'),
    bookingId:     oid('Booking'),
    invoiceId:     oid('Invoice'),
    agreementId:   oid('AgentAgreement'),
    amountMinor:   { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    currency:      { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    status:        { type: String, enum: ['Accrued', 'Cancelled', 'Paid'], default: 'Accrued' },
    ledgerEntryId: oid('JournalEntry'),
  },
  { timestamps: true }
);

agentCommissionSchema.index({ agentId: 1, roundId: 1 });

module.exports = mongoose.model('AgentCommission', agentCommissionSchema);
