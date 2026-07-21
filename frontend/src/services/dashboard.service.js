import api from '../config/axios';

export const dashboardService = {
  getStats:            () => api.get('/dashboard/stats'),
  getFleetUtilisation: () => api.get('/dashboard/fleet-utilisation'), // Sprint 022
};
