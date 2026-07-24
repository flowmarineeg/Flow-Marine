import api from '../config/axios';

const BASE = '/agents';

export const agentsService = {
  list:    (params)          => api.get(BASE, { params }),
  getById: (id)              => api.get(`${BASE}/${id}`),
  create:  (data)            => api.post(BASE, data),
  update:  (id, data)        => api.put(`${BASE}/${id}`, data),
  remove:  (id)              => api.delete(`${BASE}/${id}`),
  export:  (filters, selectedIds) =>
    api.post('/export/excel', { module: 'agents', filters, selectedIds }, { responseType: 'blob' }),
  // Sprint 033 — Agent Financial Account (the financial engine's primary output)
  getFinancialAccount: (id) => api.get(`${BASE}/${id}/financial-account`),
};
