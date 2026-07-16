import api from '../config/axios';

const BASE = '/tracking';

export const trackingService = {
  list:     (params)             => api.get(BASE, { params }),
  addEntry: (data)               => api.post(BASE, data),
  getHistory:(voyageId, params)  => api.get(`${BASE}/${voyageId}/history`, { params }),
  getLatest: ()                  => api.get(`${BASE}/latest`),
};
