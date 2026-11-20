'use client';
import { use } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import VoyageDetail from '@/modules/voyages/VoyageDetail';
export default function VoyageDetailPage({ params }) {
  const { id } = use(params);
  return <PageGuard module="voyages"><VoyageDetail voyageId={id} /></PageGuard>;
}
