import api from '../config/axios';

export const partnersService = {
  list:    (params)   => api.get('/partners', { params }),
  getById: (id)       => api.get(`/partners/${id}`),
  create:  (data)     => api.post('/partners', data),
  update:  (id, data) => api.put(`/partners/${id}`, data),
  remove:  (id)       => api.delete(`/partners/${id}`),
  // JV share table for a vessel (Sprint050 P6)
  getVesselShares:   (vesselId)         => api.get(`/vessels/${vesselId}/partners`),
  saveVesselShares:  (vesselId, shares) => api.put(`/vessels/${vesselId}/partners`, { shares }),
  clearVesselShares: (vesselId)         => api.delete(`/vessels/${vesselId}/partners`),
};
