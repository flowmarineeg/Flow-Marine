import api from '../config/axios';

const BASE = '/invoices';

export const invoicesService = {
  list:        (params) => api.get(BASE, { params }),
  getById:     (id)     => api.get(`${BASE}/${id}`),
  create:      (data)   => api.post(BASE, data),
  update:      (id, data) => api.put(`${BASE}/${id}`, data),
  remove:      (id)     => api.delete(`${BASE}/${id}`),
  // Sprint020: download invoice as PDF
  downloadPdf: (id)     => api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' }),
};
