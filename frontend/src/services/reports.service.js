import api from '../config/axios';

const BASE = '/reports';

export const reportsService = {
  getRoundPnL:          (params) => api.get(`${BASE}/round-pnl`,          { params }),
  getVoyagePerformance: (params) => api.get(`${BASE}/voyage-performance`,  { params }),
  getBookingReport:     (params) => api.get(`${BASE}/bookings`,            { params }),
  getRevenueReport:     (params) => api.get(`${BASE}/revenue`,             { params }),
  getExpenseReport:     (params) => api.get(`${BASE}/expenses`,            { params }),
};
