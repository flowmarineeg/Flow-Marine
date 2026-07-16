'use strict';

const Voyage = require('../modules/voyages/voyage.model');

/**
 * Generate voyages from consecutive route leg pairs.
 *
 * @param {Object} round       - Saved round document (must have _id, roundNumber, serviceId)
 * @param {Array}  routeLegs   - Sorted array of route leg docs (each must have portId)
 * @param {Object} service     - Service document (must have serviceCode)
 * @param {*}      createdBy   - User ObjectId
 * @returns {Array}            - Array of created Voyage documents
 */
const generateVoyages = async (round, routeLegs, service, createdBy) => {
  if (!routeLegs || routeLegs.length < 2) {
    throw { status: 400, message: 'Route must have at least 2 legs to generate voyages' };
  }

  // Sort legs by sequence ascending (defensive — should already be sorted)
  const legs = [...routeLegs].sort((a, b) => a.sequence - b.sequence);

  const voyageDocs = [];

  for (let i = 0; i < legs.length - 1; i++) {
    const pol = legs[i].portId;
    const pod = legs[i + 1].portId;
    const seq = i + 1;

    // Format: SERVICECODE-ROUNDNUMBER-SEQ  e.g. AS-ME-01-R000001-01
    const voyageNumber = `${service.serviceCode}-${round.roundNumber}-${String(seq).padStart(2, '0')}`;

    voyageDocs.push({
      voyageNumber,
      roundId:   round._id,
      serviceId: round.serviceId,
      polId:     pol._id || pol,
      podId:     pod._id || pod,
      sequence:  seq,
      status:    'Scheduled',
      createdBy,
      updatedBy: createdBy,
    });
  }

  const voyages = await Voyage.insertMany(voyageDocs);
  return voyages;
};

module.exports = { generateVoyages };
