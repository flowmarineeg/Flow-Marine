'use strict';

const pickFields = require('../../utils/pickFields');
const Agent = require('./agent.model');
const { escapeRegex } = require('../../utils/escapeRegex');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '' } = {}) => {
  const query = {};
  if (status) query.status = status;
  if (search) {
    const rx = escapeRegex(search);
    query.$or = [
      { agentCode: { $regex: rx, $options: 'i' } },
      { agentName: { $regex: rx, $options: 'i' } },
      { country:   { $regex: rx, $options: 'i' } },
      { 'contacts.email':         { $regex: rx, $options: 'i' } },
      { 'contacts.contactPerson': { $regex: rx, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    Agent.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Agent.countDocuments(query),
  ]);
  return { data, total };
};

const getById = async (id) => {
  const agent = await Agent.findOne({ _id: id }).lean();
  if (!agent) throw { status: 404, message: 'Agent not found' };
  return agent;
};

const create = async (data, createdBy) => {
  // agentCode is optional — only check uniqueness if provided
  if (data.agentCode && data.agentCode.trim() !== '') {
    const exists = await Agent.findOne({ agentCode: data.agentCode.toUpperCase() });
    if (exists) throw { status: 400, message: `Agent code "${data.agentCode}" already exists` };
  }

  const payload = {
    ...pickFields(Agent, data),
    agentCode: (data.agentCode && data.agentCode.trim() !== '')
      ? data.agentCode.toUpperCase()
      : null,
    contacts: data.contacts || [],
    createdBy,
  };

  const agent = await Agent.create(payload);
  return agent.toObject();
};

const update = async (id, data, updatedBy) => {
  const agent = await Agent.findOne({ _id: id });
  if (!agent) throw { status: 404, message: 'Agent not found' };

  // Only check agentCode uniqueness if a new code is being set
  if (data.agentCode && data.agentCode.trim() !== '') {
    const newCode = data.agentCode.toUpperCase();
    if (newCode !== agent.agentCode) {
      const exists = await Agent.findOne({ agentCode: newCode, _id: { $ne: id } });
      if (exists) throw { status: 400, message: `Agent code "${data.agentCode}" already exists` };
    }
    data.agentCode = newCode;
  } else if (data.agentCode === '' || data.agentCode === null) {
    data.agentCode = null;
  }

  Object.assign(agent, { ...pickFields(Agent, data), updatedBy });
  await agent.save();
  return agent.toObject();
};

const hardDelete = async (id) => {
  const agent = await Agent.findOne({ _id: id });
  if (!agent) throw { status: 404, message: 'Agent not found' };

  const Booking = require('../bookings/booking.model');
  const hasBookings = await Booking.findOne({ agentId: id, status: { $in: ['Pending', 'Confirmed'] } });
  if (hasBookings) throw { status: 400, message: 'Cannot delete — agent has active bookings' };

  // Same pattern as Booking's own delete guard — blocked only by a
  // non-cancelled invoice, not by cancelled invoice history.
  const Invoice = require('../invoices/invoice.model');
  const hasInvoice = await Invoice.findOne({ agentId: id, status: { $ne: 'Cancelled' } });
  if (hasInvoice) throw { status: 400, message: 'Cannot delete — agent has related invoices' };

  await Agent.findByIdAndDelete(id);
};

const getAll = async (filters = {}, selectedIds = []) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    const rx = escapeRegex(filters.search);
    query.$or = [
      { agentCode: { $regex: rx, $options: 'i' } },
      { agentName: { $regex: rx, $options: 'i' } },
    ];
  }
  if (selectedIds && selectedIds.length > 0) query._id = { $in: selectedIds };
  return Agent.find(query).sort({ createdAt: -1 }).lean();
};

// ─── Sprint 033: Agent Financial Account ──────────────────────────────────────
// The financial engine's primary output — Invoice/Payment exist to power this.
// Single aggregate call, same shape as vessel.service.js#getVesselStats:
// build the whole Round → Voyage → Booking statement tree in one function.
// Scope is Final Loading bookings only (Decision 1 — that is the entire
// invoiceable/reportable population for an agent).
const getAgentFinancialAccount = async (id) => {
  const agent = await Agent.findOne({ _id: id }).lean();
  if (!agent) throw { status: 404, message: 'Agent not found' };

  const Booking = require('../bookings/booking.model');
  const Invoice = require('../invoices/invoice.model');
  const Payment = require('../invoices/payment.model');
  const mongoose = require('mongoose');

  const bookings = await Booking.find({ agentId: id, status: 'Final Loading' })
    .populate({
      path: 'voyageId',
      select: 'voyageNumber voyageName roundId',
      populate: { path: 'roundId', select: 'roundNumber roundName createdAt' },
    })
    // Sprint 044 — container type, for the Bookings tab's summary overview
    // (booking count / total revenue / per-container-type breakdown) —
    // additive only, nothing else in this function changes.
    .populate('containerTypeId', 'code size type')
    .lean();

  const bookingIds = bookings.map(b => b._id);

  // Which bookings are invoiced (non-cancelled Invoice referencing them), and
  // under which invoice/status — Invoice-side query only, per Sprint 033
  // BOOKING–INVOICE OWNERSHIP (no field on Booking for this).
  const invoices = bookingIds.length ? await Invoice.find({
    'lineItems.bookingId': { $in: bookingIds },
    status: { $ne: 'Cancelled' },
  }).select('lineItems status invoiceNumber invoiceType totalAmount paidAmount').lean() : [];

  const invoiceByBookingId = {}; // bookingId -> { invoiceId, invoiceNumber, invoiceType, status, freightAmount }
  invoices.forEach(inv => {
    inv.lineItems.forEach(li => {
      invoiceByBookingId[String(li.bookingId)] = {
        invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, invoiceType: inv.invoiceType,
        status: inv.status, freightAmount: li.freightAmount, orphaned: li.orphaned,
      };
    });
  });

  // Exact per-booking paid amount — sum of non-voided Payment.allocations for
  // that booking (Revision 4 — never an estimate).
  const paidAgg = bookingIds.length ? await Payment.aggregate([
    { $match: { isVoided: false } },
    { $unwind: '$allocations' },
    { $match: { 'allocations.bookingId': { $in: bookingIds } } },
    { $group: { _id: '$allocations.bookingId', paid: { $sum: '$allocations.amount' } } },
  ]) : [];
  const paidByBookingId = {};
  paidAgg.forEach(p => { paidByBookingId[String(p._id)] = p.paid; });

  // ── Build the Round → Voyage → Booking tree ─────────────────────────────
  const roundsMap = new Map(); // roundId -> { roundId, roundNumber, createdAt, voyagesMap }
  bookings.forEach(b => {
    const voyage = b.voyageId;
    const round  = voyage?.roundId;
    if (!voyage || !round) return; // orphaned voyage/round reference — skip defensively

    const roundKey = String(round._id);
    if (!roundsMap.has(roundKey)) {
      roundsMap.set(roundKey, {
        roundId: round._id, roundNumber: round.roundNumber, roundName: round.roundName || null, createdAt: round.createdAt,
        voyagesMap: new Map(),
      });
    }
    const roundEntry = roundsMap.get(roundKey);

    const voyageKey = String(voyage._id);
    if (!roundEntry.voyagesMap.has(voyageKey)) {
      roundEntry.voyagesMap.set(voyageKey, {
        voyageId: voyage._id, voyageNumber: voyage.voyageNumber, voyageName: voyage.voyageName || null, bookings: [],
      });
    }

    const invoiceInfo = invoiceByBookingId[String(b._id)] || null;
    const paidAmount  = paidByBookingId[String(b._id)] || 0;
    const totalFreight = b.totalFreight;
    const remaining    = Math.max(0, totalFreight - paidAmount);

    roundEntry.voyagesMap.get(voyageKey).bookings.push({
      bookingId: b._id, bookingNumber: b.bookingNumber, containerNumber: b.containerNumber,
      containerType: b.containerTypeId ? `${b.containerTypeId.code} ${b.containerTypeId.size}` : null,
      totalFreight, paidAmount, remaining,
      invoiceId:     invoiceInfo?.invoiceId || null,
      invoiceNumber: invoiceInfo?.invoiceNumber || null,
      invoiceType:   invoiceInfo?.invoiceType || null,
      invoiceStatus: invoiceInfo ? invoiceInfo.status : 'Not Invoiced',
      orphaned:      invoiceInfo?.orphaned || false,
    });
  });

  // Bound to the agent's most recent 20 rounds, matching getVesselStats' own
  // precedent for a bounded statement payload.
  const rounds = [...roundsMap.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20)
    .map(r => {
      const voyages = [...r.voyagesMap.values()].map(v => {
        const totalFreight = v.bookings.reduce((s, x) => s + x.totalFreight, 0);
        const totalPaid     = v.bookings.reduce((s, x) => s + x.paidAmount, 0);
        return {
          voyageId: v.voyageId, voyageNumber: v.voyageNumber, voyageName: v.voyageName || null,
          bookings: v.bookings,
          totalFreight, totalPaid, remaining: Math.max(0, totalFreight - totalPaid),
        };
      });
      const totalFreight = voyages.reduce((s, v) => s + v.totalFreight, 0);
      const totalPaid     = voyages.reduce((s, v) => s + v.totalPaid, 0);
      return {
        roundId: r.roundId, roundNumber: r.roundNumber, roundName: r.roundName || null,
        voyages,
        totalFreight, totalPaid, remaining: Math.max(0, totalFreight - totalPaid),
      };
    });

  // ── Agent-level KPIs (Decision 2/3/7) ────────────────────────────────────
  const totalRevenue = bookings.reduce((s, b) => s + b.totalFreight, 0);

  const [invoiceAgg] = await Invoice.aggregate([
    { $match: { agentId: new mongoose.Types.ObjectId(String(id)), status: { $ne: 'Cancelled' } } },
    { $group: { _id: null, totalInvoiced: { $sum: '$totalAmount' } } },
  ]);
  const totalInvoiced = invoiceAgg?.totalInvoiced || 0;

  const [paymentAgg] = await Payment.aggregate([
    { $match: { agentId: new mongoose.Types.ObjectId(String(id)), isVoided: false } },
    { $group: { _id: null, totalPaid: { $sum: '$amount' } } },
  ]);
  const totalPaid = paymentAgg?.totalPaid || 0;

  const outstandingBalance = Math.max(0, totalInvoiced - totalPaid);
  const remainingBalance   = Math.max(0, totalRevenue - totalPaid);

  const allBookingRows = rounds.flatMap(r => r.voyages.flatMap(v => v.bookings));
  const bookingsAwaitingInvoice = allBookingRows.filter(b => !b.invoiceId);
  const bookingsAwaitingPayment = allBookingRows.filter(b => ['Issued', 'Partially Paid', 'Overdue'].includes(b.invoiceStatus));
  const bookingsFullyPaid       = allBookingRows.filter(b => b.invoiceStatus === 'Paid');

  return {
    agent,
    kpis: {
      totalRevenue, totalInvoiced, totalPaid, outstandingBalance, remainingBalance,
      paymentProgress: totalInvoiced > 0 ? totalPaid / totalInvoiced : 0,
      bookingsAwaitingInvoiceCount: bookingsAwaitingInvoice.length,
      bookingsAwaitingInvoiceFreight: bookingsAwaitingInvoice.reduce((s, b) => s + b.totalFreight, 0),
      bookingsAwaitingPaymentCount: bookingsAwaitingPayment.length,
      bookingsFullyPaidCount: bookingsFullyPaid.length,
    },
    rounds,
  };
};

module.exports = { list, getById, create, update, hardDelete, getAll, getAgentFinancialAccount };
