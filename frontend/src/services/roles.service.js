import api from '../config/axios';

export const rolesService = {
  list:    (params)    => api.get('/roles', { params }),
  getById: (id)        => api.get(`/roles/${id}`),
  create:  (data)      => api.post('/roles', data),
  update:  (id, data)  => api.put(`/roles/${id}`, data),
  remove:  (id)        => api.delete(`/roles/${id}`),
};

export const permissionsService = {
  getByRoleId:  (roleId)       => api.get(`/permissions/${roleId}`),
  saveByRoleId: (roleId, data) => api.put(`/permissions/${roleId}`, { permissions: data }),
};
