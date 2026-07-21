import api from '../config/axios';

const BASE = '/capacity';

export const capacityService = {
  /**
   * GET /capacity/round/:roundId
   * Full per-leg capacity payload for a specific round.
   * @param {string} roundId
   * @param {{ statuses?: string }} params  — optional e.g. { statuses: 'Confirmed,Pending' }
   */
  getRoundCapacity: (roundId, params = {}) =>
    api.get(`${BASE}/round/${roundId}`, { params }),

  /**
   * GET /capacity/vessel/:vesselId/active
   * Capacity for the vessel's current Active round.
   * Returns { vessel, activeRound: null | fullPayload }
   */
  getVesselActiveCapacity: (vesselId) =>
    api.get(`${BASE}/vessel/${vesselId}/active`),

  /**
   * POST /capacity/preview
   * Pre-flight check: can a new booking fit on the round?
   * Phase 4.
   */
  previewCapacity: (data) =>
    api.post(`${BASE}/preview`, data),
};
