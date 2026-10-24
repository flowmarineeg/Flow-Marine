import api from '../config/axios';

const BASE = '/round-accounting';

// Sprint 053 - round closing, partner settlement, JV reserve. Amounts are integer minor units.
export const roundAccountingService = {
  checklist:     (id)         => api.get(`${BASE}/rounds/${id}/checklist`),
  markReady:     (id)         => api.post(`${BASE}/rounds/${id}/ready`),
  close:         (id, data)   => api.post(`${BASE}/rounds/${id}/close`, data),
  reopen:        (id, reason) => api.post(`${BASE}/rounds/${id}/reopen`, { reason }),
  getSettlement: (id, currency) => api.get(`${BASE}/rounds/${id}/partner-settlement`, { params: { currency } }),
  calculate:     (id, data)   => api.post(`${BASE}/rounds/${id}/partner-settlement`, data),
  downloadSheet: (id, currency) => api.get(`${BASE}/rounds/${id}/partner-settlement/excel`, { params: { currency }, responseType: 'blob' }),
  payTransfer:   (tid, data)  => api.post(`${BASE}/transfers/${tid}/pay`, data),
  unpayTransfer: (tid, reason) => api.post(`${BASE}/transfers/${tid}/unpay`, { reason }),
  vesselReserve: (vesselId)   => api.get(`${BASE}/vessels/${vesselId}/reserve`),
  useReserve:    (data)       => api.post(`${BASE}/reserve/use`, data),
};
