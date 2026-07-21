import api from '../config/axios';

const BASE = '/bookings';

export const bookingsService = {
  list:            (params)      => api.get(BASE, { params }),
  getById:         (id)          => api.get(`${BASE}/${id}`),
  create:          (data)        => api.post(BASE, data),
  update:          (id, data)    => api.put(`${BASE}/${id}`, data),
  remove:          (id)          => api.delete(`${BASE}/${id}`),
  getVoyagePorts:  (voyageId)    => api.get(`${BASE}/voyage-ports/${voyageId}`),
  // Import
  importPreview:   (data)        => api.post(`${BASE}/import/preview`, data),
  importSave:      (data)        => api.post(`${BASE}/import/save`, data),
  // Layer 1 — Manual Bookings (Sprint 023)
  listManual:      (params)      => api.get(`${BASE}/manual`, { params }),
  getManualById:   (id)          => api.get(`${BASE}/manual/${id}`),
  createManual:    (data)        => api.post(`${BASE}/manual`, data),
  updateManual:    (id, data)    => api.put(`${BASE}/manual/${id}`, data),
  removeManual:    (id)          => api.delete(`${BASE}/manual/${id}`),
};
