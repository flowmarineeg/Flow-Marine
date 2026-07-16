'use client';
import PageGuard from '@/components/ui/PageGuard';
import UserList from '@/modules/users/UserList';
export default function UsersPage() {
  return <PageGuard module="users"><UserList /></PageGuard>;
}
