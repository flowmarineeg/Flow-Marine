import api from '../config/axios';

const BASE = '/voyages';

export const voyagesService = {
  list:              (params)   => api.get(BASE, { params }),
  getById:           (id)       => api.get(`${BASE}/${id}`),
  getRoundRoutePorts:(roundId)  => api.get(`${BASE}/round-ports/${roundId}`),
  create:            (data)     => api.post(BASE, data),
  update:            (id, data) => api.put(`${BASE}/${id}`, data),
  remove:            (id)       => api.delete(`${BASE}/${id}`),
};
