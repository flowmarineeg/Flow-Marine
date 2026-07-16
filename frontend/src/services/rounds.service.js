import api from '../config/axios';

const BASE = '/rounds';

export const roundsService = {
  list:            (params)      => api.get(BASE, { params }),
  getById:         (id)          => api.get(`${BASE}/${id}`),
  getVoyages:      (id)          => api.get(`${BASE}/${id}/voyages`),
  create:          (data)        => api.post(BASE, data),
  update:          (id, data)    => api.put(`${BASE}/${id}`, data),
  remove:          (id)          => api.delete(`${BASE}/${id}`),
};
