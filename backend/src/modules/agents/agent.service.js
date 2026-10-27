'use strict';

const pickFields = require('../../utils/pickFields');
const Agent = require('./agent.model');
const { escapeRegex } = require('../../utils/escapeRegex');
const AppError = require('../../utils/AppError');
const { assertAccountFor } = require('../ledger/accountRules');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// roles/partyType are no longer editable (profile removed); legacy values stay stored and are still read by agent accounts.
const NOT_WRITABLE = ['roles', 'partyType', 'ledgerVersion'];

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

/** Any existing agent can be the booking source (owner 2026-10-27: roles/profile removed). */
const assertBookingSource = async (agentId) => {
  if (!agentId) return;
  if (!(await Agent.exists({ _id: agentId }))) throw new AppError(400, 'Agent not found', 'AGENT_NOT_FOUND');
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

  if (data.receivableAccountId) await assertAccountFor(data.receivableAccountId, 'receivable', 'AR account');

  const payload = {
    ...pickFields(Agent, data, NOT_WRITABLE),
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

  if (data.receivableAccountId) await assertAccountFor(data.receivableAccountId, 'receivable', 'AR account');
  Object.assign(agent, { ...pickFields(Agent, data, NOT_WRITABLE), updatedBy });
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

  // Sprint050 R6 — dependents engine (agreements, commissions, ledger lines)
  const { assertNoDependents, DEPENDENTS } = require('../../utils/dependents');
  await assertNoDependents('agent', id, DEPENDENTS.agent);

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

module.exports = { list, getById, create, update, hardDelete, getAll, assertBookingSource };
