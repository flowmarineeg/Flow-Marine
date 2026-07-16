'use client';
import PageGuard from '@/components/ui/PageGuard';
import RoundList from '@/modules/rounds/RoundList';
export default function RoundsPage() {
  return <PageGuard module="rounds"><RoundList /></PageGuard>;
}
