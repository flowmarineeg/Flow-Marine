'use strict';

// Bookings page, voyage level: one row per voyage that has bookings of the chosen kind, with the round, the voyage,
// the number of bookings, total freight and total TEU. Clicking a row opens that voyage's bookings (the normal list
// with ?voyageId=). Same filters and partner scoping as the lists, so the totals match what the row opens.
const mongoose = require('mongoose');
const Booking = require('./booking.model');
const ManualBooking = require('./manualBooking.model');
const Voyage = require('../voyages/voyage.model');
const ContainerType = require('../containerTypes/containerType.model');
const { escapeRegex } = require('../../utils/escapeRegex');
const { parsePaging } = require('../locations/paging.logic');
const { TABS, summariseEstimated, summariseOperational, summariseByStatus, sortRows } = require('./bookingSummary.logic');

const idOrNull = (v, label) => {
  if (v === undefined || v === null || v === '') return null;
  if (!mongoose.isValidObjectId(String(v))) throw { status: 400, message: `Invalid ${label}` };
  return String(v);
};

const voyageSummary = async (params = {}, scope = null) => {
  const tab = String(params.tab || '');
  if (!TABS.includes(tab)) throw { status: 400, message: `tab must be one of: ${TABS.join(', ')}` };
  const roundId = idOrNull(params.roundId, 'round');
  const agentId = idOrNull(params.agentId, 'agent');
  const partnerId = idOrNull(params.partnerId, 'partner');
  const status = String(params.status || '');
  const search = String(params.search || '').trim();
  const layer1 = tab === 'estimated';

  const match = {};
  if (roundId) match.voyageId = { $in: await Voyage.find({ roundId }).distinct('_id') };
  if (agentId) match.agentId = new mongoose.Types.ObjectId(agentId);
  if (scope) match.partnerId = new mongoose.Types.ObjectId(scope); // a partner user only ever sees their own partner
  else if (partnerId) match.partnerId = new mongoose.Types.ObjectId(partnerId);
  if (status) match.status = status.includes(',') ? { $in: status.split(',').map((s) => s.trim()) } : status;
  if (tab === 'discharged') match.dischargeStatus = 'Discharged';
  if (tab === 'remaining') match.dischargeStatus = 'Remaining';
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    match.$or = layer1 ? [{ bookingNumber: rx }] : [{ bookingNumber: rx }, { shipper: rx }, { consignee: rx }, { containerNumber: rx }];
  }

  let totals;
  if (layer1) {
    totals = summariseEstimated(await ManualBooking.aggregate([
      { $match: match },
      { $group: { _id: '$voyageId', bookings: { $sum: 1 }, totalFreight: { $sum: '$totalFreight' }, totalTEU: { $sum: '$totalTEU' } } },
    ]));
  } else {
    const groups = (await Booking.aggregate([
      { $match: match },
      { $group: { _id: { voyageId: '$voyageId', containerTypeId: '$containerTypeId' }, count: { $sum: 1 }, freight: { $sum: '$totalFreight' } } },
    ])).map((g) => ({ voyageId: g._id.voyageId, containerTypeId: g._id.containerTypeId, count: g.count, freight: g.freight }));
    const types = await ContainerType.find({ _id: { $in: [...new Set(groups.map((g) => String(g.containerTypeId)))] } }).select('size').lean();
    totals = summariseOperational(groups, new Map(types.map((t) => [String(t._id), t.size])));
  }

  const voyages = await Voyage.find({ _id: { $in: [...totals.keys()] } })
    .select('voyageNumber voyageName direction status roundId')
    .populate('roundId', 'roundNumber roundName startDate')
    .lean();
  const rows = sortRows(voyages.map((v) => ({
    voyageId: v._id,
    voyageNumber: v.voyageNumber,
    voyageName: v.voyageName || null,
    direction: v.direction || null,
    voyageStatus: v.status,
    roundId: v.roundId?._id || null,
    roundNumber: v.roundId?.roundNumber || null,
    roundName: v.roundId?.roundName || null,
    roundStart: v.roundId?.startDate || null,
    ...totals.get(String(v._id)),
  })));

  const { page, limit, skip } = parsePaging(params);
  return { data: rows.slice(skip, skip + limit), total: rows.length, page, limit };
};

/**
 * One voyage, both layers, per status: { estimated: {Pending:{bookings,freight,teu},...}, operational: {...}, allocation: {...} }.
 * `allocation` = the Layer 1 rows of kind Allocation (a part of `estimated`, never added to it): the "of which allocation" line.
 * Same collections and TEU rule as voyageSummary (Layer 1 stored totalTEU; Layer 2 container size through teuResolver).
 */
const voyageStatusTotals = async (voyageId) => {
  const vid = new mongoose.Types.ObjectId(String(voyageId));
  const l1 = await ManualBooking.aggregate([
    { $match: { voyageId: vid } },
    { $group: { _id: '$status', bookings: { $sum: 1 }, totalFreight: { $sum: '$totalFreight' }, totalTEU: { $sum: '$totalTEU' } } },
  ]);
  const alloc = await ManualBooking.aggregate([
    { $match: { voyageId: vid, kind: 'Allocation' } },
    { $group: { _id: '$status', bookings: { $sum: 1 }, totalFreight: { $sum: '$totalFreight' }, totalTEU: { $sum: '$totalTEU' } } },
  ]);
  const l2 = (await Booking.aggregate([
    { $match: { voyageId: vid } },
    { $group: { _id: { status: '$status', containerTypeId: '$containerTypeId' }, count: { $sum: 1 }, freight: { $sum: '$totalFreight' } } },
  ])).map((g) => ({ status: g._id.status, containerTypeId: g._id.containerTypeId, count: g.count, freight: g.freight }));
  const types = await ContainerType.find({ _id: { $in: [...new Set(l2.map((g) => String(g.containerTypeId)))] } }).select('size').lean();
  return {
    estimated: summariseByStatus(l1, 1),
    allocation: summariseByStatus(alloc, 1),
    operational: summariseByStatus(l2, 2, new Map(types.map((t) => [String(t._id), t.size]))),
  };
};

module.exports = { voyageSummary, voyageStatusTotals };
