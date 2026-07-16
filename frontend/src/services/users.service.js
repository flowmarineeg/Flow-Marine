import api from '../config/axios';

const BASE = '/users';

export const usersService = {
  list:         (params)       => api.get(BASE, { params }),
  getById:      (id)           => api.get(`${BASE}/${id}`),
  create:       (data)         => api.post(BASE, data),
  invite:       (data)         => api.post(`${BASE}/invite`, data),
  acceptInvite: (data)         => api.post(`${BASE}/accept-invite`, data),
  resendInvite: (id)           => api.post(`${BASE}/${id}/resend-invite`),
  update:       (id, data)     => api.put(`${BASE}/${id}`, data),
  remove:       (id)           => api.delete(`${BASE}/${id}`),
};
