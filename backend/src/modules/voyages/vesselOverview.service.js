'use strict';

// Voyages page, vessel level (sprint vessel-first-navigation, Sprint B). Read-only. Level 1 = the vessels that have an
// open round with an open voyage; level 2 = one vessel's open rounds and voyages. TEU and percentages come from the
// capacity engine (computeRoundCapacity), never recomputed here.
const mongoose = require('mongoose');
const Round = require('../rounds/round.model');
const Voyage = require('./voyage.model');
const Vessel = require('../vessels/vessel.model');
const { computeRoundCapacity } = require('../capacity/capacity.service');
const { escapeRegex } = require('../../utils/escapeRegex');
const { parsePaging } = require('../locations/paging.logic');
const logic = require('./vesselOverview.logic');

const openRoundsWithVoyages = async (roundFilter) => {
  const rounds = await Round.find({ ...roundFilter, status: { $in: logic.OPEN_ROUND_STATUSES } })
    .select('vesselId roundNumber roundName status startDate endDate').lean();
  if (!rounds.length) return { rounds: [], voyagesByRound: new Map() };
  const voyages = await Voyage.find({ roundId: { $in: rounds.map((r) => r._id) }, status: { $in: logic.OPEN_VOYAGE_STATUSES } })
    .select('roundId voyageNumber voyageName direction status sequence polId podId etd eta atd ata')
    .populate('polId', 'name code').populate('podId', 'name code')
    .lean();
  const voyagesByRound = new Map();
  for (const v of voyages) {
    const k = String(v.roundId);
    if (!voyagesByRound.has(k)) voyagesByRound.set(k, []);
    voyagesByRound.get(k).push(v);
  }
  return { rounds: rounds.filter((r) => voyagesByRound.has(String(r._id))), voyagesByRound };
};

// Capacity rows of the given rounds (cached 60 s by the engine): Map(roundId -> Map(voyageId -> row)).
const capacityRows = async (rounds) => {
  const out = new Map();
  await Promise.all(rounds.map(async (r) => {
    const cap = await computeRoundCapacity(r._id);
    out.set(String(r._id), new Map((cap.voyages || []).map((row) => [String(row.voyageId), row])));
  }));
  return out;
};

const blocksOf = (rounds, voyagesByRound, capByRound) =>
  rounds.map((r) => logic.roundBlock(r, voyagesByRound.get(String(r._id)) || [], capByRound.get(String(r._id)) || new Map()));

/** Level 1: GET /voyages/vessel-overview?search=&page=&limit= */
const vesselList = async (params = {}) => {
  const search = String(params.search || '').trim();
  const { rounds, voyagesByRound } = await openRoundsWithVoyages({});
  const vesselIds = [...new Set(rounds.map((r) => String(r.vesselId)))];

  const vq = { _id: { $in: vesselIds } };
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    vq.$or = [{ vesselName: rx }, { vesselCode: rx }];
  }
  const vessels = await Vessel.find(vq).select('vesselCode vesselName capacity').sort({ vesselName: 1, _id: 1 }).lean();

  const { page, limit, skip } = parsePaging(params);
  const pageVessels = vessels.slice(skip, skip + limit);
  const pageIds = new Set(pageVessels.map((v) => String(v._id)));
  const pageRounds = rounds.filter((r) => pageIds.has(String(r.vesselId)));
  const capByRound = await capacityRows(pageRounds);

  const data = pageVessels.map((v) => {
    const own = pageRounds.filter((r) => String(r.vesselId) === String(v._id));
    return logic.vesselRow(v, blocksOf(own, voyagesByRound, capByRound));
  });
  return { data, total: vessels.length, page, limit };
};

/** Level 2: GET /voyages/vessel-overview/:vesselId */
const vesselDetail = async (vesselId) => {
  if (!mongoose.isValidObjectId(String(vesselId))) throw { status: 400, message: 'Invalid vessel' };
  const vessel = await Vessel.findById(vesselId).select('vesselCode vesselName capacity').lean();
  if (!vessel) throw { status: 404, message: 'Vessel not found' };

  const { rounds, voyagesByRound } = await openRoundsWithVoyages({ vesselId: vessel._id });
  const capByRound = await capacityRows(rounds);
  const blocks = blocksOf(rounds, voyagesByRound, capByRound);
  const order = logic.orderRounds(blocks.map((b) => b.round));
  const ordered = order.map((r) => blocks.find((b) => String(b.round._id) === String(r._id)));
  const all = ordered.flatMap((b) => b.voyages);

  return {
    vessel: { _id: vessel._id, vesselCode: vessel.vesselCode, vesselName: vessel.vesselName, capacity: vessel.capacity ?? null },
    totals: { ...logic.totalsOf(all), openVoyages: all.length, openRounds: ordered.length },
    rounds: ordered,
  };
};

module.exports = { vesselList, vesselDetail };
