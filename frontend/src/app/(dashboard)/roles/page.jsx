'use client';
import PageGuard from '@/components/ui/PageGuard';
import RoleList from '@/modules/roles/RoleList';
export default function RolesPage() {
  return <PageGuard module="roles"><RoleList /></PageGuard>;
}
