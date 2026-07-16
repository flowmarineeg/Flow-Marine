'use client';
import { Suspense } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import TrackingList from '@/modules/tracking/TrackingList';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function TrackingPage() {
  return (
    <PageGuard module="tracking">
      <Suspense fallback={<LoadingSpinner fullPage />}>
        <TrackingList />
      </Suspense>
    </PageGuard>
  );
}
