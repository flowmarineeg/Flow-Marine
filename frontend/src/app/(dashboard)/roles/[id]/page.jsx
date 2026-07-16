'use client';
import { use } from 'react';
import PermissionMatrix from '@/modules/roles/PermissionMatrix';
export default function RolePermissionsPage({ params }) {
  const { id } = use(params);
  return <PermissionMatrix roleId={id} />;
}
