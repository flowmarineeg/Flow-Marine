'use strict';

const Agent = require('./agent.model');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '' } = {}) => {
  const query = { isDeleted: false };
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { agentCode: { $regex: search, $options: 'i' } },
      { agentName: { $regex: search, $options: 'i' } },
      { country:   { $regex: search, $options: 'i' } },
      { 'contacts.email':         { $regex: search, $options: 'i' } },
      { 'contacts.contactPerson': { $regex: search, $options: 'i' } },
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
  const agent = await Agent.findOne({ _id: id, isDeleted: false }).lean();
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
    ...data,
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
  const agent = await Agent.findOne({ _id: id, isDeleted: false });
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

  Object.assign(agent, { ...data, updatedBy });
  await agent.save();
  return agent.toObject();
};

const softDelete = async (id, deletedBy) => {
  const agent = await Agent.findOne({ _id: id, isDeleted: false });
  if (!agent) throw { status: 404, message: 'Agent not found' };

  const Booking = require('../bookings/booking.model');
  const hasBookings = await Booking.findOne({ agentId: id, status: { $in: ['Pending', 'Confirmed'] }, isDeleted: false });
  if (hasBookings) throw { status: 400, message: 'Cannot delete — agent has active bookings' };

  agent.isDeleted = true;
  agent.deletedAt = new Date();
  agent.updatedBy = deletedBy;
  await agent.save();
};

const getAll = async (filters = {}, selectedIds = []) => {
  const query = { isDeleted: false };
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    query.$or = [
      { agentCode: { $regex: filters.search, $options: 'i' } },
      { agentName: { $regex: filters.search, $options: 'i' } },
    ];
  }
  if (selectedIds && selectedIds.length > 0) query._id = { $in: selectedIds };
  return Agent.find(query).sort({ createdAt: -1 }).lean();
};

module.exports = { list, getById, create, update, softDelete, getAll };
