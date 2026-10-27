'use strict';

const mongoose = require('mongoose');
const Route    = require('./route.model');
const RouteLeg = require('./routeLeg.model');
const Service  = require('../services/service.model');
const Country  = require('../locations/country.model');
const City     = require('../locations/city.model');
const Port     = require('../locations/port.model');
const Terminal = require('../locations/terminal.model');
const Agent    = require('../agents/agent.model');
const { assertLegShape, assertNoConsecutivePorts, collectRefIds, checkLegReferences } = require('./routeLegs.logic');

const getByServiceId = async (serviceId) => {
  const service = await Service.findOne({ _id: serviceId }).lean();
  if (!service) throw { status: 404, message: 'Service not found' };

  const route = await Route.findOne({ serviceId }).lean();
  if (!route) return { route: null, legs: [] };

  const legs = await RouteLeg.find({ routeId: route._id })
    .populate('countryId',  'name code')
    .populate('cityId',     'name')
    .populate('portId',     'name code')
    .populate('terminalId', 'name')
    .populate('agentId',    'agentCode agentName')
    .sort({ sequence: 1 })
    .lean();

  return { route, legs };
};

const saveLegs = async (serviceId, legs, userId) => {
  // 1. Everything is validated before the first write (RV-08/09/10/11/12).
  assertLegShape(legs);
  assertNoConsecutivePorts(legs);

  const service = await Service.findOne({ _id: serviceId }).select('_id').lean();
  if (!service) throw { status: 404, message: 'Service not found' };

  const ids = collectRefIds(legs);
  const load = async (Model, list) => new Map(
    (list.length ? await Model.find({ _id: { $in: list } }).select('countryId cityId portId').lean() : []).map((d) => [String(d._id), d])
  );
  const [countries, cities, ports, terminals, agents] = await Promise.all([
    load(Country, ids.countries), load(City, ids.cities), load(Port, ids.ports), load(Terminal, ids.terminals), load(Agent, ids.agents),
  ]);
  checkLegReferences(legs, { countries, cities, ports, terminals, agents });

  // Active/Completed rounds keep the route frozen. Planned rounds are safe: they hold their own
  // routeSnapshot (RV-13/14), so editing the service route no longer changes their history.
  let Round;
  try { Round = require('../rounds/round.model'); } catch { Round = null; }
  if (Round) {
    const lockedRound = await Round.findOne({ serviceId, status: { $in: ['Active', 'Completed'] } });
    if (lockedRound) {
      throw {
        status: 400,
        message: `Cannot edit route — round ${lockedRound.roundNumber} is ${lockedRound.status.toLowerCase()}`,
      };
    }
  }

  // 2. Replace atomically (RV-33): a failure rolls back and the old legs stay; readers outside the
  // transaction never see an empty or half-written route.
  let routeId;
  await mongoose.connection.transaction(async (session) => {
    const route = await Route.findOneAndUpdate(
      { serviceId },
      { serviceId, updatedBy: userId, $setOnInsert: { createdBy: userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
    routeId = route._id;
    await RouteLeg.deleteMany({ routeId }, { session });
    await RouteLeg.insertMany(legs.map((leg, idx) => ({
      routeId,
      sequence:   idx + 1,
      countryId:  leg.countryId,
      cityId:     leg.cityId,
      portId:     leg.portId,
      terminalId: leg.terminalId || null,
      agentId:    leg.agentId    || null,
      createdBy:  userId,
      updatedBy:  userId,
    })), { session });
  });

  const route = await Route.findById(routeId).lean();
  const populated = await RouteLeg.find({ routeId })
    .populate('countryId',  'name code')
    .populate('cityId',     'name')
    .populate('portId',     'name code')
    .populate('terminalId', 'name')
    .populate('agentId',    'agentCode agentName')
    .sort({ sequence: 1 })
    .lean();

  return { route, legs: populated };
};

module.exports = { getByServiceId, saveLegs };
