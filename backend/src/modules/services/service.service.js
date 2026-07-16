'use strict';

const Service = require('./service.model');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// ─── List ─────────────────────────────────────────────────────────────────────
const list = async ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, search = '', status = '' } = {}) => {
  const query = { isDeleted: false };
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { serviceCode: { $regex: search, $options: 'i' } },
      { serviceName: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);

  // Get services with vessel info
  const [services, total] = await Promise.all([
    Service.find(query)
      .populate('defaultVesselId', 'vesselCode vesselName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Service.countDocuments(query),
  ]);

  // Attach leg count to each service
  const RouteLeg = require('../routes/routeLeg.model');
  const Route    = require('../routes/route.model');

  const serviceIds = services.map(s => s._id);
  const routes = await Route.find({ serviceId: { $in: serviceIds }, isDeleted: false }).lean();
  const routeMap = {};
  routes.forEach(r => { routeMap[String(r.serviceId)] = r._id; });

  const routeIds = routes.map(r => r._id);
  const legCounts = await RouteLeg.aggregate([
    { $match: { routeId: { $in: routeIds } } },
    { $group: { _id: '$routeId', count: { $sum: 1 } } },
  ]);
  const legCountMap = {};
  legCounts.forEach(lc => { legCountMap[String(lc._id)] = lc.count; });

  const data = services.map(s => {
    const routeId = routeMap[String(s._id)];
    return { ...s, legCount: routeId ? (legCountMap[String(routeId)] || 0) : 0 };
  });

  return { data, total };
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getById = async (id) => {
  const service = await Service.findOne({ _id: id, isDeleted: false })
    .populate('defaultVesselId', 'vesselCode vesselName')
    .lean();
  if (!service) throw { status: 404, message: 'Service not found' };
  return service;
};

// ─── Create ───────────────────────────────────────────────────────────────────
const create = async (data, createdBy) => {
  const exists = await Service.findOne({ serviceCode: data.serviceCode.toUpperCase() });
  if (exists) throw { status: 400, message: `Service code "${data.serviceCode}" already exists` };

  const service = await Service.create({
    ...data,
    serviceCode: data.serviceCode.toUpperCase(),
    createdBy,
  });
  return service.toObject();
};

// ─── Update ───────────────────────────────────────────────────────────────────
const update = async (id, data, updatedBy) => {
  const service = await Service.findOne({ _id: id, isDeleted: false });
  if (!service) throw { status: 404, message: 'Service not found' };

  if (data.serviceCode) {
    const code = data.serviceCode.toUpperCase();
    const dup = await Service.findOne({ serviceCode: code, _id: { $ne: id } });
    if (dup) throw { status: 400, message: `Service code "${code}" already exists` };
    data.serviceCode = code;
  }

  Object.assign(service, { ...data, updatedBy });
  await service.save();
  return service.toObject();
};

// ─── Soft Delete ──────────────────────────────────────────────────────────────
const softDelete = async (id, deletedBy) => {
  const service = await Service.findOne({ _id: id, isDeleted: false });
  if (!service) throw { status: 404, message: 'Service not found' };

  // Block if active/planned rounds reference this service
  let Round;
  try { Round = require('../rounds/round.model'); } catch { Round = null; }
  if (Round) {
    const activeRound = await Round.findOne({ serviceId: id, status: { $in: ['Planned', 'Active'] }, isDeleted: false });
    if (activeRound) throw { status: 400, message: `Cannot delete — service is used by round ${activeRound.roundNumber}` };
  }

  service.isDeleted = true;
  service.deletedAt = new Date();
  service.updatedBy = deletedBy;
  await service.save();
};

// ─── Get all active (for dropdowns) ──────────────────────────────────────────
const listActive = async () => {
  return Service.find({ isDeleted: false, status: 'Active' })
    .select('serviceCode serviceName')
    .sort({ serviceName: 1 })
    .lean();
};

module.exports = { list, getById, create, update, softDelete, listActive };
