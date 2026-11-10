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

  // Users of a partner role are external: whatever the permission rows say, only bookings is open to them
  // (the API enforces the same in rbac). Keeps the sidebar and buttons honest.
  const isPartnerUser = user?.roleId?.isPartnerRole === true;

  const can = (module, action) => {
    if (isSuperAdmin) return true;
    if (isPartnerUser && module !== 'bookings') return false;
    return permMap[module]?.[action] === true;
  };

  const isHidden = (module) => {
    if (isSuperAdmin) return false;
    if (isPartnerUser && module !== 'bookings') return true;
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
