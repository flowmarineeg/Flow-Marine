import api from '../config/axios';

const BASE = '/payments';

// Sprint 033 — Agent Details "Payments" tab
export const paymentsService = {
  list: (params) => api.get(BASE, { params }),
};
