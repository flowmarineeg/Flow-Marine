import api from '../config/axios';

const BASE = '/expense-types';

export const expenseTypesService = {
  list:           (params)               => api.get(BASE, { params }),
  getById:        (id)                   => api.get(`${BASE}/${id}`),

  // Category management
  getCategories:  ()                     => api.get(`${BASE}/categories`),
  createCategory: (name)                 => api.post(`${BASE}/categories`, { name }),
  deleteCategory: (id)                   => api.delete(`${BASE}/categories/${id}`),

  // Expense type CRUD
  create:         (data)                 => api.post(BASE, data),
  update:         (id, data)             => api.put(`${BASE}/${id}`, data),
  remove:         (id)                   => api.delete(`${BASE}/${id}`),
  export:         (filters, selectedIds) => api.post('/export/excel', { module: 'expenseTypes', filters, selectedIds }, { responseType: 'blob' }),
};
