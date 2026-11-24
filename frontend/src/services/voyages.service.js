import api from '../config/axios';

const BASE = '/voyages';

export const voyagesService = {
  list:              (params)   => api.get(BASE, { params }),
  // Voyages page: vessels with an open round + open voyage (level 1), one vessel's open rounds/voyages (level 2)
  vesselOverview:    (params)   => api.get(`${BASE}/vessel-overview`, { params }),
  vesselOverviewDetail: (vesselId) => api.get(`${BASE}/vessel-overview/${vesselId}`),
  getById:           (id)       => api.get(`${BASE}/${id}`),
  summary:           (id)       => api.get(`${BASE}/${id}/summary`),
  getRoundRoutePorts:(roundId)  => api.get(`${BASE}/round-ports/${roundId}`),
  create:            (data)     => api.post(BASE, data),
  update:            (id, data) => api.put(`${BASE}/${id}`, data),
  refreshPortCalls:  (id)       => api.post(`${BASE}/${id}/refresh-port-calls`),
  remove:            (id)       => api.delete(`${BASE}/${id}`),
};
