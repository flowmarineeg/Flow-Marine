'use strict';

const mongoose = require('mongoose');
const AppError = require('./AppError');

/**
 * Sprint050 P8 / R6 — dependents check for delete. Deliberately NOT a
 * cascade: it only COUNTS records that still depend on the target and refuses
 * the delete, naming each blocker with its count (proposal §9.2). The caller
 * decides what to delete once nothing blocks.
 *
 * spec: { model: 'ModelName', field: 'refField', label: 'human plural',
 *         filter?: extra query }
 * A spec whose model is not registered (collection not built yet) is skipped.
 */
const countDependents = async (id, specs, { session } = {}) => {
  const out = [];
  for (const s of specs) {
    let Model;
    try { Model = mongoose.model(s.model); } catch { continue; }
    const q = { [s.field]: id, ...(s.filter || {}) };
    const n = await Model.countDocuments(q).session(session || null);
    if (n > 0) out.push({ label: s.label, count: n });
  }
  return out;
};

const assertNoDependents = async (what, id, specs, opts = {}) => {
  const blockers = await countDependents(id, specs, opts);
  if (blockers.length) {
    const msg = blockers.map((b) => `${b.count} ${b.label}`).join(', ');
    const err = new AppError(409, `Cannot delete this ${what} — still has: ${msg}`, 'HAS_DEPENDENTS');
    err.blockers = blockers;
    throw err;
  }
};

// Declarative table (proposal §9.2).
const DEPENDENTS = {
  partner: [
    { model: 'VesselPartner',    field: 'partnerId', label: 'vessel share rows' },
    { model: 'JournalEntryLine', field: 'partnerId', label: 'ledger lines' },
    { model: 'Expense',          field: 'paidByPartnerId', label: 'expenses paid' },
    { model: 'PartnerSettlement', field: 'partners.partnerId', label: 'partner settlements' },
    { model: 'PartnerTransfer',  field: 'fromPartnerId', label: 'transfers paid' },
    { model: 'PartnerTransfer',  field: 'toPartnerId', label: 'transfers received' },
    { model: 'InvoiceSettlement', field: 'bankAccount.partnerId', label: 'receipts into their bank' },
  ],
  vessel: [
    { model: 'VesselPartner', field: 'vesselId', label: 'partner share rows' },
    { model: 'Round',         field: 'vesselId', label: 'rounds' },
  ],
  // Audit H5 - posted records must never be orphaned by a delete.
  round: [
    { model: 'JournalEntryLine',         field: 'roundId', label: 'ledger lines' },
    { model: 'PartnerSettlement',        field: 'roundId', label: 'finalised partner settlements', filter: { status: 'Final' } },
    { model: 'JvReserveMovement',        field: 'roundId', label: 'reserve movements' },
    { model: 'HandlingCharge',           field: 'roundId', label: 'handling charges' },
    { model: 'AgentSettlementStatement', field: 'roundId', label: 'agent settlement statements' },
    { model: 'Expense',                  field: 'roundId', label: 'posted expenses', filter: { ledgerEntryId: { $ne: null } } },
    { model: 'BookingItem',              field: 'roundId', label: 'items on invoices', filter: { locked: true } },
  ],
  voyage: [
    { model: 'JournalEntryLine', field: 'voyageId', label: 'ledger lines' },
    { model: 'Expense',          field: 'voyageId', label: 'posted expenses', filter: { ledgerEntryId: { $ne: null } } },
    { model: 'BookingItem',      field: 'voyageId', label: 'items on invoices', filter: { locked: true } },
  ],
  customer: [
    { model: 'Booking',          field: 'customerId', label: 'bookings' },
    { model: 'ManualBooking',    field: 'customerId', label: 'estimated bookings' },
  ],
  agent: [
    { model: 'AgentAgreement',   field: 'agentId', label: 'agreements' },
    { model: 'AgentCommission',  field: 'agentId', label: 'commissions' },
    { model: 'HandlingCharge',    field: 'agentId', label: 'handling charges' },
    { model: 'AgentSettlementStatement', field: 'agentId', label: 'settlement statements' },
    { model: 'JournalEntryLine', field: 'agentId', label: 'ledger lines' },
    { model: 'ManualBooking',    field: 'agentId', label: 'estimated bookings' },
    { model: 'Booking',          field: 'agentId', label: 'bookings' },
    { model: 'RouteLeg',         field: 'agentId', label: 'route legs' },
    { model: 'Round',            field: 'routeSnapshot.legs.agentId', label: 'rounds (route snapshot)' },
  ],
  // RV-28: a service is referenced by rounds of ANY status, their voyages and tracking. Its own
  // Route/RouteLeg belong to the service and are removed with it, so they are not blockers.
  service: [
    { model: 'Round',            field: 'serviceId', label: 'rounds' },
    { model: 'Voyage',           field: 'serviceId', label: 'voyages' },
    { model: 'TrackingHistory',  field: 'serviceId', label: 'tracking records' },
  ],
  // RV-31: a port used by any voyage (generated or manual), booking or round snapshot must stay. Terminals and
  // current route legs are still checked by location.service.deletePort with their own messages.
  port: [
    { model: 'Voyage',           field: 'polId', label: 'voyages (loading port)' },
    { model: 'Voyage',           field: 'podId', label: 'voyages (discharge port)' },
    { model: 'Booking',          field: 'polId', label: 'bookings (loading port)' },
    { model: 'Booking',          field: 'podId', label: 'bookings (discharge port)' },
    { model: 'ManualBooking',    field: 'polId', label: 'estimated bookings (loading port)' },
    { model: 'ManualBooking',    field: 'podId', label: 'estimated bookings (discharge port)' },
    { model: 'Round',            field: 'routeSnapshot.legs.portId', label: 'rounds (route snapshot)' },
  ],
};

module.exports = { countDependents, assertNoDependents, DEPENDENTS };
