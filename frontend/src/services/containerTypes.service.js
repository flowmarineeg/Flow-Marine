import api from '../config/axios';

export const containerTypesService = {
  list:    (params)               => api.get('/container-types', { params }),
  getById: (id)                   => api.get(`/container-types/${id}`),
  create:  (data)                 => api.post('/container-types', data),
  update:  (id, data)             => api.put(`/container-types/${id}`, data),
  remove:  (id)                   => api.delete(`/container-types/${id}`),
  export:  (filters, selectedIds) => api.post('/export/excel', { module: 'containerTypes', filters, selectedIds }, { responseType: 'blob' }),
};
