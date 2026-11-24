'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PageGuard from '@/components/ui/PageGuard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import VoyageVesselList from '@/modules/voyages/VoyageVesselList';
import VoyageList from '@/modules/voyages/VoyageList';

// /voyages = vessels with open rounds and voyages; /voyages?view=all = the full list of every voyage (history included).
function VoyagesView() {
  const all = useSearchParams().get('view') === 'all';
  return all ? <VoyageList /> : <VoyageVesselList />;
}

export default function VoyagesPage() {
  return (
    <PageGuard module="voyages">
      <Suspense fallback={<LoadingSpinner fullPage />}><VoyagesView /></Suspense>
    </PageGuard>
  );
}
