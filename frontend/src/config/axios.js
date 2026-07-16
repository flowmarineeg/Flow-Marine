'use client';

import axios from 'axios';

const api = axios.create({
  baseURL:         process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1',
  headers:         { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// ─── Global 401 handler ───────────────────────────────────────────────────────
// Only redirect to /login for 401s that come from protected API calls.
// Auth-related endpoints must be exempted so their errors bubble up normally:
//   - /auth/login         → wrong credentials must show toast, not redirect
//   - /auth/me            → called on every mount to rehydrate session;
//                           a 401 here means "not logged in" — handled by
//                           AuthContext setting isAuthenticated=false, NOT a redirect
//   - /auth/forgot-password, /auth/reset-password → public flows
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const isExempt =
        url.includes('/auth/login') ||
        url.includes('/auth/me') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/reset-password');

      if (!isExempt && typeof window !== 'undefined') {
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
