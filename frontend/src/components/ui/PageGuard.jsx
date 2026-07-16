'use client';

import { usePermission } from '@/context/PermissionContext';
import { useAuth } from '@/context/AuthContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

/**
 * Page-level RBAC guard.
 * Renders children when the user has `action` permission on `module`.
 * Renders an Unauthorized block otherwise.
 *
 * Usage (wrap the module component inside a page.jsx):
 *   <PageGuard module="users" action="read">
 *     <UserList />
 *   </PageGuard>
 *
 * Props:
 *   module   {string}    - RBAC module name
 *   action   {string}    - required action (default: 'read')
 *   children {ReactNode}
 */
export default function PageGuard({ module, action = 'read', children }) {
  const { can, isHidden, permissionsLoaded } = usePermission();
  const { isLoading } = useAuth();

  if (isLoading || !permissionsLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (isHidden(module) || !can(module, action)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '60vh', gap: 16, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="24" height="24" fill="none" stroke="#F87171" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M12 15v2m0-12v6m-9 4.5A9 9 0 1121 12a9 9 0 01-18 0z"/>
          </svg>
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>
            Access Denied
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6, maxWidth: 320 }}>
            You don&apos;t have permission to view this section.
            Contact your administrator to request access.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
