import api from '../config/axios';

const BASE = '/agent-accounts';

// Sprint 052 - agent SOA, netting, agreements, handling, final settlement. Amounts are integer minor units.
export const agentAccountsService = {
  soa:            (id, params)      => api.get(`${BASE}/${id}/soa`, { params }),
  advance:        (id, data)        => api.post(`${BASE}/${id}/advance`, data),
  returnAdvance:  (id, data)        => api.post(`${BASE}/${id}/advance-return`, data),
  pay:            (id, data)        => api.post(`${BASE}/${id}/pay`, data),
  offset:         (id, data)        => api.post(`${BASE}/${id}/offset`, data),
  reverseOffset:  (id, batchId, reason) => api.post(`${BASE}/${id}/offset/${encodeURIComponent(batchId)}/reverse`, { reason }),
  handlingPreview:(id, roundId)     => api.get(`${BASE}/${id}/handling/preview`, { params: { roundId } }),
  handlingConfirm:(id, roundId)     => api.post(`${BASE}/${id}/handling/confirm`, { roundId }),
  listHandling:   (id, roundId)     => api.get(`${BASE}/${id}/handling`, { params: { roundId } }),
  getStatement:   (id, roundId, currency) => api.get(`${BASE}/${id}/statement`, { params: { roundId, currency } }),
  buildStatement: (id, data)        => api.post(`${BASE}/${id}/statement`, data),
  agreeStatement: (statementId)     => api.post(`${BASE}/statements/${statementId}/agree`),
  settleStatement:(statementId)     => api.post(`${BASE}/statements/${statementId}/settle`),
  listAgreements: (id)              => api.get(`${BASE}/${id}/agreements`),
  listCommissions:(id, params)      => api.get(`${BASE}/${id}/commissions`, { params }),
  cancelCommission:(commissionId, reason) => api.post(`${BASE}/commissions/${commissionId}/cancel`, { reason }),
  saveAgreement:  (id, data, agreementId) =>
    agreementId ? api.put(`${BASE}/${id}/agreements/${agreementId}`, data) : api.post(`${BASE}/${id}/agreements`, data),
  deleteAgreement:(id, agreementId) => api.delete(`${BASE}/${id}/agreements/${agreementId}`),
};

export const expensesV2Service = {
  convertToFda: (id, data) => api.post(`/expenses/${id}/convert-fda`, data),
  post:         (id)       => api.post(`/expenses/${id}/post`),
  reverse:      (id, reason) => api.post(`/expenses/${id}/reverse`, { reason }),
};
