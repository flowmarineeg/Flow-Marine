'use client';
import { use } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import PermissionMatrix from '@/modules/roles/PermissionMatrix';
export default function RolePermissionsPage({ params }) {
  const { id } = use(params);
  return <PageGuard module="roles"><PermissionMatrix roleId={id} /></PageGuard>;
}
