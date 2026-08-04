import api from '../config/axios';

const BASE = '/invoices';

export const invoicesService = {
  list:        (params) => api.get(BASE, { params }),
  getById:     (id)     => api.get(`${BASE}/${id}`),
  create:      (data)   => api.post(BASE, data),
  update:      (id, data) => api.put(`${BASE}/${id}`, data),
  // Sprint 047 — Bill To (PDF contact details), always editable
  updateBillTo: (id, data) => api.put(`${BASE}/${id}/bill-to`, data),
  remove:      (id)     => api.delete(`${BASE}/${id}`),
  // Sprint020: download invoice as PDF
  downloadPdf: (id)     => api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' }),

  // Sprint 033 — Decision 6 eligible-bookings composition table
  getEligibleBookings: (params) => api.get(`${BASE}/eligible-bookings`, { params }),

  // Sprint 033 — explicit per-line-item payment allocation (Revision 4)
  listPayments: (id)   => api.get(`${BASE}/${id}/payments`),
  createPayment: (id, data) => api.post(`${BASE}/${id}/payments`, data),
  voidPayment:  (id, paymentId, data) => api.post(`${BASE}/${id}/payments/${paymentId}/void`, data),
};
