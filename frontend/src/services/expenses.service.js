import api from '../config/axios';

const BASE = '/expenses';

export const expensesService = {
  list:    (params)      => api.get(BASE, { params }),
  getById: (id)          => api.get(`${BASE}/${id}`),
  // File upload requires FormData — no JSON content-type
  create:  (formData)    => api.post(BASE, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update:  (id, formData)=> api.put(`${BASE}/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  remove:  (id)          => api.delete(`${BASE}/${id}`),
};
