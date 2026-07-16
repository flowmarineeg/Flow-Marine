'use strict';

const Route    = require('./route.model');
const RouteLeg = require('./routeLeg.model');
const Service  = require('../services/service.model');

const getByServiceId = async (serviceId) => {
  const service = await Service.findOne({ _id: serviceId, isDeleted: false }).lean();
  if (!service) throw { status: 404, message: 'Service not found' };

  const route = await Route.findOne({ serviceId, isDeleted: false }).lean();
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
  if (!legs || legs.length < 2) {
    throw { status: 400, message: 'A route must have at least 2 legs' };
  }

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (!leg.countryId || !leg.cityId || !leg.portId) {
      throw { status: 400, message: `Leg ${i + 1}: country, city, and port are required` };
    }
  }

  let Round;
  try { Round = require('../rounds/round.model'); } catch { Round = null; }
  if (Round) {
    const lockedRound = await Round.findOne({
      serviceId,
      status: { $in: ['Active', 'Completed'] },
      isDeleted: false,
    });
    if (lockedRound) {
      throw {
        status: 400,
        message: `Cannot edit route — round ${lockedRound.roundNumber} is ${lockedRound.status.toLowerCase()}`,
      };
    }
  }

  const route = await Route.findOneAndUpdate(
    { serviceId },
    { serviceId, isDeleted: false, updatedBy: userId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!route.createdBy) {
    route.createdBy = userId;
    await route.save();
  }

  await RouteLeg.deleteMany({ routeId: route._id });

  const legDocs = legs.map((leg, idx) => ({
    routeId:    route._id,
    sequence:   idx + 1,
    countryId:  leg.countryId,
    cityId:     leg.cityId,
    portId:     leg.portId,
    terminalId: leg.terminalId || null,
    agentId:    leg.agentId    || null,
    createdBy:  userId,
    updatedBy:  userId,
  }));

  await RouteLeg.insertMany(legDocs);

  const populated = await RouteLeg.find({ routeId: route._id })
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
