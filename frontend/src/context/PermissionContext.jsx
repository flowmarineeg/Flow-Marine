'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import api from '../config/axios';
import { useAuth } from './AuthContext';

const PermissionContext = createContext(null);

export const PermissionProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [permMap, setPermMap] = useState({});
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  useEffect(() => {
    // SuperAdmin skips permission fetch — mark loaded immediately
    if (isAuthenticated && user?.roleId?.isSystem) {
      setPermissionsLoaded(true);
      return;
    }
    if (!isAuthenticated || !user?.roleId?._id) {
      setPermMap({});
      setPermissionsLoaded(false);
      return;
    }
    api.get(`/permissions/${user.roleId._id}`)
      .then((res) => {
        const map = {};
        res.data.data.forEach((p) => { map[p.module] = p.actions; });
        setPermMap(map);
        setPermissionsLoaded(true);
      })
      .catch((err) => {
        console.error('[PermissionContext] Failed to load permissions:', err?.response?.status, err?.response?.data?.message);
        setPermMap({});
        setPermissionsLoaded(true);
      });
  }, [isAuthenticated, user?.roleId?._id]);

  // SuperAdmin bypasses all checks
  const isSuperAdmin = user?.roleId?.isSystem === true;

  const can = (module, action) => {
    if (isSuperAdmin) return true;
    return permMap[module]?.[action] === true;
  };

  const isHidden = (module) => {
    if (isSuperAdmin) return false;
    return permMap[module]?.hidden === true;
  };

  return (
    <PermissionContext.Provider value={{ can, isHidden, permMap, permissionsLoaded }}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermission = () => {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermission must be used within PermissionProvider');
  return ctx;
};
