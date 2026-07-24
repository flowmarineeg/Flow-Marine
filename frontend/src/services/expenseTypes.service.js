import api from '../config/axios';

const BASE = '/expense-types';

export const expenseTypesService = {
  list:           (params)               => api.get(BASE, { params }),
  getById:        (id)                   => api.get(`${BASE}/${id}`),

  // Category management
  getCategories:  ()                     => api.get(`${BASE}/categories`),
  createCategory: (name, costClassification) => api.post(`${BASE}/categories`, { name, costClassification }),
  // Sprint 035 — the only editable field on a category is its Voyage
  // Profitability cost classification; name is not renameable.
  updateCategory: (id, costClassification)   => api.put(`${BASE}/categories/${id}`, { costClassification }),
  deleteCategory: (id)                   => api.delete(`${BASE}/categories/${id}`),

  // Expense type CRUD
  create:         (data)                 => api.post(BASE, data),
  update:         (id, data)             => api.put(`${BASE}/${id}`, data),
  remove:         (id)                   => api.delete(`${BASE}/${id}`),
  export:         (filters, selectedIds) => api.post('/export/excel', { module: 'expenseTypes', filters, selectedIds }, { responseType: 'blob' }),
};
