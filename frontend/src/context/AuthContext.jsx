'use client';

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '../config/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Seed user from localStorage immediately so UI has something to show
  // before the /auth/me round-trip completes.
  const [user,            setUser]            = useState(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);  // always false until /auth/me confirms
  const [isLoading,       setIsLoading]       = useState(true);

  // Guard so rehydrate runs exactly once per mount — React StrictMode double-invokes
  // effects in dev, and this ensures we don't fire two concurrent /auth/me calls.
  const rehydrated = useRef(false);

  useEffect(() => {
    if (rehydrated.current) return;
    rehydrated.current = true;

    const rehydrate = async () => {
      try {
        const res = await api.get('/auth/me');
        const u   = res.data.data;
        setUser(u);
        setIsAuthenticated(true);
        localStorage.setItem('user', JSON.stringify(u));
      } catch {
        // 401 → no valid cookie → not logged in. This is expected on the login page.
        // The axios interceptor exempts /auth/me from the global redirect, so this
        // catch block is the only handler — we simply mark the user as logged out.
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem('user');
      } finally {
        setIsLoading(false);
      }
    };

    rehydrate();
  }, []);

  // ─── Login ─────────────────────────────────────────────────────────────────
  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const u   = res.data.data.user;
    setUser(u);
    setIsAuthenticated(true);
    localStorage.setItem('user', JSON.stringify(u));
    return u;
  };

  // ─── Logout ────────────────────────────────────────────────────────────────
  const logout = async () => {
    try { await api.post('/auth/logout'); } catch (_) {}
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('user');
  };

  // ─── Update local user cache ───────────────────────────────────────────────
  const updateUser = (updated) => {
    setUser(updated);
    localStorage.setItem('user', JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
