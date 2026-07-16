'use client';
import { use } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import RoundDetail from '@/modules/rounds/RoundDetail';
export default function RoundDetailPage({ params }) {
  const { id } = use(params);
  return <PageGuard module="rounds"><RoundDetail roundId={id} /></PageGuard>;
}
