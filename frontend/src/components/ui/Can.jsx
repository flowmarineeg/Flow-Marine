'use client';

import { usePermission } from '@/context/PermissionContext';

/**
 * Inline RBAC guard — renders children only when the user has the required permission.
 *
 * Usage:
 *   <Can module="bookings" action="create">
 *     <Button>+ New Booking</Button>
 *   </Can>
 *
 *   <Can module="vessels" action="delete" fallback={<span>—</span>}>
 *     <DeleteButton />
 *   </Can>
 *
 * Props:
 *   module   {string}    - RBAC module name (must be in MODULES constant)
 *   action   {string}    - action: 'create' | 'read' | 'update' | 'delete' | 'import' | 'export'
 *   fallback {ReactNode} - optional element to render when access is denied (default: null)
 *   children {ReactNode} - content to render when access is granted
 */
export default function Can({ module, action, fallback = null, children }) {
  const { can } = usePermission();
  return can(module, action) ? children : fallback;
}
