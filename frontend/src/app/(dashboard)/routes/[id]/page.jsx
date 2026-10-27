'use client';
import { use, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PageGuard from '@/components/ui/PageGuard';
import ServiceDetail from '@/modules/services/ServiceDetail';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function ServiceDetailContent({ id }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'details';
  return <ServiceDetail serviceId={id} defaultTab={tab} />;
}

export default function ServiceDetailPage({ params }) {
  const { id } = use(params);
  return (
    <PageGuard module="services">
      <Suspense fallback={<LoadingSpinner fullPage />}>
        <ServiceDetailContent id={id} />
      </Suspense>
    </PageGuard>
  );
}
