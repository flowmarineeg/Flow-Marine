'use strict';

const TrackingHistory = require('./trackingHistory.model');
const Voyage          = require('../voyages/voyage.model');
const Round           = require('../rounds/round.model');
const { DEFAULT_PAGE, DEFAULT_LIMIT } = require('../../config/constants');

// ─── Populate helper ──────────────────────────────────────────────────────────
const pop = (q) =>
  q.populate('voyageId',   'voyageNumber')
   .populate('roundId',    'roundNumber')
   .populate('vesselId',   'vesselCode vesselName')
   .populate('serviceId',  'serviceCode serviceName')
   .populate('portId',     'name code')
   .populate('terminalId', 'name')
   .populate('countryId',  'name code')
   .populate('cityId',     'name')
   .populate('createdBy',  'name email');

// ─── Create entry (append-only) ───────────────────────────────────────────────
const createEntry = async (data, userId) => {
  // 1. Voyage must exist
  const voyage = await Voyage.findById(data.voyageId).lean();
  if (!voyage) throw { status: 404, message: 'Voyage not found' };

  // 2. Voyage must belong to the submitted roundId
  if (String(voyage.roundId) !== String(data.roundId)) {
    throw { status: 400, message: 'Voyage does not belong to the selected round' };
  }

  // 3. VesselId must match the vessel assigned to this round
  const round = await Round.findById(data.roundId).lean();
  if (!round) throw { status: 404, message: 'Round not found' };
  if (String(round.vesselId) !== String(data.vesselId)) {
    throw { status: 400, message: `Vessel mismatch — round ${round.roundNumber} is assigned to a different vessel` };
  }

  // 4. lastUpdate must not be in the future
  const lastUpdate = new Date(data.lastUpdate);
  if (lastUpdate > new Date()) {
    throw { status: 400, message: 'Last update time cannot be in the future' };
  }

  // 5. Append new entry — never overwrite
  const entry = await TrackingHistory.create({
    voyageId:   data.voyageId,
    roundId:    data.roundId,
    vesselId:   data.vesselId,
    serviceId:  data.serviceId,
    countryId:  data.countryId  || null,
    cityId:     data.cityId     || null,
    portId:     data.portId,
    terminalId: data.terminalId || null,
    status:     data.status,
    remarks:    data.remarks    || null,
    lastUpdate,
    createdBy: userId,
  });

  return pop(TrackingHistory.findById(entry._id)).lean();
};

// ─── Get paginated history for a voyage ──────────────────────────────────────
const getHistory = async (voyageId, { page = DEFAULT_PAGE, limit = DEFAULT_LIMIT } = {}) => {
  const voyage = await Voyage.findById(voyageId).lean();
  if (!voyage) throw { status: 404, message: 'Voyage not found' };

  const skip = (Number(page) - 1) * Number(limit);
  const query = { voyageId };

  const [data, total] = await Promise.all([
    pop(TrackingHistory.find(query)).sort({ lastUpdate: -1 }).skip(skip).limit(Number(limit)).lean(),
    TrackingHistory.countDocuments(query),
  ]);

  return { data, total, voyage };
};

// ─── List all tracking entries with filters ─────────────────────────────────
const listEntries = async ({
  page = DEFAULT_PAGE, limit = DEFAULT_LIMIT,
  vesselId = '', voyageId = '', serviceId = '', status = '',
  dateFrom = '', dateTo = '', search = '',
} = {}) => {
  const query = {};
  if (vesselId)  query.vesselId  = vesselId;
  if (voyageId)  query.voyageId  = voyageId;
  if (serviceId) query.serviceId = serviceId;
  if (status)    query.status    = status;
  if (search)    query.remarks   = { $regex: search, $options: 'i' };
  if (dateFrom || dateTo) {
    query.lastUpdate = {};
    if (dateFrom) query.lastUpdate.$gte = new Date(dateFrom);
    if (dateTo)   query.lastUpdate.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    pop(TrackingHistory.find(query)).sort({ lastUpdate: -1 }).skip(skip).limit(Number(limit)).lean(),
    TrackingHistory.countDocuments(query),
  ]);
  return { data, total };
};

// ─── Get latest position across all active voyages (for dashboard widget) ────
const getLatestPositions = async () => {
  // One entry per voyage — the most recent one
  const latest = await TrackingHistory.aggregate([
    { $sort: { lastUpdate: -1 } },
    { $group: { _id: '$voyageId', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $limit: 50 },
  ]);

  const ids = latest.map(e => e._id);
  return pop(TrackingHistory.find({ _id: { $in: ids } })).lean();
};

module.exports = { createEntry, listEntries, getHistory, getLatestPositions };
