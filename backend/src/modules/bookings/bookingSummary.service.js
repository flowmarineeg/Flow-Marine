'use strict';

// Bookings page summaries. Three levels share one source of totals (totalsByVoyage), so every number adds up to the
// rows one level down and to the booking lists:
//   voyageSummary  one row per voyage that has bookings of the chosen kind (round, voyage, bookings, freight, TEU)
//   roundSummary   one row per round of a vessel (vessel-first navigation, Sprint C1)
//   vesselSummary  one row per vessel with open rounds (vessel-first navigation, Sprint C1)
// Same filters and partner scoping as the lists, so a row's totals match what opening it shows.
const mongoose = require('mongoose');
const Booking = require('./booking.model');
const ManualBooking = require('./manualBooking.model');
const Voyage = require('../voyages/voyage.model');
const Round = require('../rounds/round.model');
const Vessel = require('../vessels/vessel.model');
const ContainerType = require('../containerTypes/containerType.model');
const { escapeRegex } = require('../../utils/escapeRegex');
const { parsePaging } = require('../locations/paging.logic');
const {
  TABS, summariseEstimated, summariseOperational, summariseByStatus, sortRows,
  roundStatusesFor, parseIncludeClosed, wantsZeroRows, rollupRounds, rollupVessels,
} = require('./bookingSummary.logic');

const idOrNull = (v, label) => {
  if (v === undefined || v === null || v === '') return null;
  if (!mongoose.isValidObjectId(String(v))) throw { status: 400, message: `Invalid ${label}` };
  return String(v);
};

const assertTab = (params) => {
  const tab = String(params.tab || '');
  if (!TABS.includes(tab)) throw { status: 400, message: `tab must be one of: ${TABS.join(', ')}` };
  return tab;
};

// The booking-level filters shared by every summary (same names and rules as the lists). Partner users are confined to
// their own partner label. `layer1` = ManualBooking (no container / shipper fields to search).
const bookingMatch = (params, scope, layer1, tab) => {
  const agentId = idOrNull(params.agentId, 'agent');
  const partnerId = idOrNull(params.partnerId, 'partner');
  const status = String(params.status || '');
  const search = String(params.search || '').trim();
  const match = {};
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
  return { match, filters: { search, agentId: agentId || '', partnerId: partnerId || '', status } };
};

// Per-voyage totals Map(voyageId -> {bookings, totalFreight, totalTEU}) for a match: Layer 1 stored totalTEU,
// Layer 2 container size through teuResolver. The single source for the voyage, round and vessel summaries.
const totalsByVoyage = async (match, layer1) => {
  if (layer1) {
    return summariseEstimated(await ManualBooking.aggregate([
      { $match: match },
      { $group: { _id: '$voyageId', bookings: { $sum: 1 }, totalFreight: { $sum: '$totalFreight' }, totalTEU: { $sum: '$totalTEU' } } },
    ]));
  }
  const groups = (await Booking.aggregate([
    { $match: match },
    { $group: { _id: { voyageId: '$voyageId', containerTypeId: '$containerTypeId' }, count: { $sum: 1 }, freight: { $sum: '$totalFreight' } } },
  ])).map((g) => ({ voyageId: g._id.voyageId, containerTypeId: g._id.containerTypeId, count: g.count, freight: g.freight }));
  const types = await ContainerType.find({ _id: { $in: [...new Set(groups.map((g) => String(g.containerTypeId)))] } }).select('size').lean();
  return summariseOperational(groups, new Map(types.map((t) => [String(t._id), t.size])));
};

const voyageSummary = async (params = {}, scope = null) => {
  const tab = assertTab(params);
  const roundId = idOrNull(params.roundId, 'round');
  const layer1 = tab === 'estimated';

  const { match } = bookingMatch(params, scope, layer1, tab);
  if (roundId) match.voyageId = { $in: await Voyage.find({ roundId }).distinct('_id') };

  const totals = await totalsByVoyage(match, layer1);

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

// Round rows of a tab: the shared core of the vessel and round summaries. Rounds are the open ones (Planned / Active),
// plus Completed when includeClosed (default per tab, see parseIncludeClosed); Cancelled rounds never. vesselId / roundId
// narrow them. Totals come from totalsByVoyage over the voyages of exactly those rounds.
const roundRowsOf = async (params, scope, { vesselId = null, roundId = null } = {}) => {
  const tab = assertTab(params);
  const layer1 = tab === 'estimated';
  const includeClosed = parseIncludeClosed(params.includeClosed, tab);

  const { match, filters } = bookingMatch(params, scope, layer1, tab);
  const roundQuery = { status: { $in: roundStatusesFor(includeClosed) } };
  if (vesselId) roundQuery.vesselId = vesselId;
  if (roundId) roundQuery._id = roundId;
  const rounds = await Round.find(roundQuery).select('vesselId roundNumber roundName status startDate').lean();
  const voyages = await Voyage.find({ roundId: { $in: rounds.map((r) => r._id) } }).select('roundId status').lean();
  match.voyageId = { $in: voyages.map((v) => v._id) };

  const totals = await totalsByVoyage(match, layer1);
  const zeroRows = wantsZeroRows(tab, { scoped: !!scope, ...filters });
  const roundRows = rollupRounds({ rounds, voyages, totals, zeroRows });

  const vessels = await Vessel.find({ _id: { $in: [...new Set(roundRows.map((r) => String(r.vesselId)))] } }).select('vesselCode vesselName').lean();
  return { roundRows, vessels: new Map(vessels.map((v) => [String(v._id), v])), includeClosed };
};

/** Bookings page, level 1: one row per vessel (rounds, voyages, bookings, total TEU, total freight). */
const vesselSummary = async (params = {}, scope = null) => {
  const { roundRows, vessels, includeClosed } = await roundRowsOf(params, scope);
  const rows = rollupVessels(roundRows, vessels);
  const { page, limit, skip } = parsePaging(params);
  return { data: rows.slice(skip, skip + limit), total: rows.length, page, limit, includeClosed };
};

/** Bookings page, level 2: one row per round of a vessel (or of one round, for a deep link). */
const roundSummary = async (params = {}, scope = null) => {
  const vesselId = idOrNull(params.vesselId, 'vessel');
  const roundId = idOrNull(params.roundId, 'round');
  if (!vesselId && !roundId) throw { status: 400, message: 'vesselId or roundId is required' };
  const { roundRows, vessels, includeClosed } = await roundRowsOf(params, scope, { vesselId, roundId });
  const rows = roundRows.map((r) => {
    const v = vessels.get(String(r.vesselId));
    return { ...r, vesselCode: v?.vesselCode || null, vesselName: v?.vesselName || null };
  });
  const { page, limit, skip } = parsePaging(params);
  return { data: rows.slice(skip, skip + limit), total: rows.length, page, limit, includeClosed };
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

module.exports = { voyageSummary, vesselSummary, roundSummary, voyageStatusTotals };
