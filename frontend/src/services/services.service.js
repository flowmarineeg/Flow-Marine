import api from '../config/axios';

const BASE = '/services';

export const servicesService = {
  list:       (params)       => api.get(BASE, { params }),
  listActive: ()             => api.get(`${BASE}/active`),
  getById:    (id)           => api.get(`${BASE}/${id}`),
  create:     (data)         => api.post(BASE, data),
  update:     (id, data)     => api.put(`${BASE}/${id}`, data),
  remove:     (id)           => api.delete(`${BASE}/${id}`),
};
