import api from '../config/axios';

const BASE = '/vessels';

export const vesselsService = {
  list:     (params)               => api.get(BASE, { params }),
  getById:  (id)                   => api.get(`${BASE}/${id}`),
  getStats: (id)                   => api.get(`${BASE}/${id}/stats`),
  create:   (data)                 => api.post(BASE, data),
  update:   (id, data)             => api.put(`${BASE}/${id}`, data),
  remove:   (id)                   => api.delete(`${BASE}/${id}`),
  export:   (filters, selectedIds) =>
    api.post('/export/excel', { module: 'vessels', filters, selectedIds }, { responseType: 'blob' }),
};
