'use client';
import { use, Suspense } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import VoyageDetail from '@/modules/voyages/VoyageDetail';
export default function VoyageDetailPage({ params }) {
  const { id } = use(params);
  return (
    <PageGuard module="voyages">
      <Suspense fallback={<LoadingSpinner fullPage />}><VoyageDetail voyageId={id} /></Suspense>
    </PageGuard>
  );
}
