import api from '../config/axios';

export const auditLogsService = {
  list:    (params) => api.get('/audit-logs', { params }),
  getById: (id)     => api.get(`/audit-logs/${id}`),
};
