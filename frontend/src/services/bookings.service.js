import api from '../config/axios';

const BASE = '/bookings';

export const bookingsService = {
  list:            (params)      => api.get(BASE, { params }),
  getById:         (id)          => api.get(`${BASE}/${id}`),
  create:          (data)        => api.post(BASE, data),
  update:          (id, data)    => api.put(`${BASE}/${id}`, data),
  remove:          (id)          => api.delete(`${BASE}/${id}`),
  getVoyagePorts:  (voyageId)    => api.get(`${BASE}/voyage-ports/${voyageId}`),
  // Bookings sprint 2026-11-10 — form support (also for partner users)
  lookups:         (roundId)     => api.get(`${BASE}/lookups`, { params: roundId ? { roundId } : {} }),
  resolveVoyage:   (data)        => api.post(`${BASE}/resolve-voyage`, data),
  // Import
  importPreview:   (data)        => api.post(`${BASE}/import/preview`, data),
  importSave:      (data)        => api.post(`${BASE}/import/save`, data),
  // Sprint 042 — import template (backend-generated, ExcelJS, colored headers)
  importTemplateColumns: ()      => api.get(`${BASE}/import/template-columns`),
  downloadImportTemplate: ()     => api.get(`${BASE}/import/template`, { responseType: 'blob' }),
  // Layer 1 — Manual Bookings (Sprint 023)
  listManual:      (params)      => api.get(`${BASE}/manual`, { params }),
  getManualById:   (id)          => api.get(`${BASE}/manual/${id}`),
  createManual:    (data)        => api.post(`${BASE}/manual`, data),
  updateManual:    (id, data)    => api.put(`${BASE}/manual/${id}`, data),
  removeManual:    (id)          => api.delete(`${BASE}/manual/${id}`),
  // Discharge list by POL -> POD (screen + Excel), reworked 2026-11-10
  dischargeList:   (params)      => api.get(`${BASE}/discharge-list`, { params }),
  exportDischargeList: (params)  =>
    api.get(`${BASE}/export/discharge-list`, { params, responseType: 'blob' }),
};
