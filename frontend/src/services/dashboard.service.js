import api from '../config/axios';

export const dashboardService = {
  getStats: () => api.get('/dashboard/stats'),
};
