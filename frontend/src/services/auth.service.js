import api from '../config/axios';

export const authService = {
  login:           (email, password)       => api.post('/auth/login', { email, password }),
  logout:          ()                      => api.post('/auth/logout'),
  getMe:           ()                      => api.get('/auth/me'),
  changePassword:  (data)                  => api.patch('/auth/change-password', data),
  forgotPassword:  (email)                 => api.post('/auth/forgot-password', { email }),
  resetPassword:   (token, newPassword)    => api.post('/auth/reset-password', { token, newPassword }),
};
