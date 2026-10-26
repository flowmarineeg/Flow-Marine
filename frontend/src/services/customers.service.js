import api from '../config/axios';

export const CUSTOMER_TYPES = ['Commercial Agent', 'NVOCC', 'Freight Forwarder'];

export const customersService = {
  list:    (params)   => api.get('/customers', { params }),
  getById: (id)       => api.get(`/customers/${id}`),
  create:  (data)     => api.post('/customers', data),
  update:  (id, data) => api.put(`/customers/${id}`, data),
  remove:  (id)       => api.delete(`/customers/${id}`),
  // MasterTable expects an export function; customers have no Excel export yet.
  export:  ()         => Promise.reject(new Error('not supported')),
};
