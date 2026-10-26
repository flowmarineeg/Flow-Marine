import api from '../config/axios';

const BASE = '/vessels';

export const vesselsService = {
  list:     (params)               => api.get(BASE, { params }),
  getById:  (id)                   => api.get(`${BASE}/${id}`),
  getStats: (id)                   => api.get(`${BASE}/${id}/stats`),
  create:   (data)                 => api.post(BASE, data),
  update:   (id, data)             => api.put(`${BASE}/${id}`, data),
  remove:   (id)                   => api.delete(`${BASE}/${id}`),
  uploadParticulars: (id, file)    => { const fd = new FormData(); fd.append('file', file); return api.post(`${BASE}/${id}/particulars`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); },
  removeParticulars: (id)          => api.delete(`${BASE}/${id}/particulars`),
  particularsUrl:    (id)          => `${api.defaults.baseURL}${BASE}/${id}/particulars`,
  export:   (filters, selectedIds) =>
    api.post('/export/excel', { module: 'vessels', filters, selectedIds }, { responseType: 'blob' }),
};
