import api from '../config/axios';

const BASE = '/invoices';

// Invoicing (Version 2). All money amounts are integer minor units.
export const invoicesService = {
  list:        (params) => api.get(BASE, { params }),
  getById:     (id)     => api.get(`${BASE}/${id}`),
  // Bill To (PDF contact details), always editable
  updateBillTo: (id, data) => api.put(`${BASE}/${id}/bill-to`, data),
  downloadPdf: (id)     => api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' }),

  // Wizard: items the bill-to party can still be invoiced for
  listItems:        (params)            => api.get(`${BASE}/items`, { params }),
  createDraft:      (data)              => api.post(BASE, data),
  updateDraft:      (id, data)          => api.put(`${BASE}/${id}`, data),
  remove:           (id)                => api.delete(`${BASE}/${id}`), // Draft only
  issue:            (id)                => api.post(`${BASE}/${id}/issue`),
  cancel:           (id, reason, cancelCommission = false) => api.post(`${BASE}/${id}/cancel`, { reason, cancelCommission }),
  listSettlements:  (id)                => api.get(`${BASE}/${id}/settlements`),
  recordSettlement: (id, data)          => api.post(`${BASE}/${id}/settlements`, data),
  voidSettlement:   (id, sid, reason)   => api.post(`${BASE}/${id}/settlements/${sid}/void`, { reason }),
  creditNote:       (id, data)          => api.post(`${BASE}/${id}/credit-note`, data),
  debitNote:        (id, data)          => api.post(`${BASE}/${id}/debit-note`, data),
};
