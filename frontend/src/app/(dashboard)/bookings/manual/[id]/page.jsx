'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import PageGuard        from '@/components/ui/PageGuard';
import LoadingSpinner   from '@/components/ui/LoadingSpinner';
import Button           from '@/components/ui/Button';
import { bookingsService } from '@/services/bookings.service';
import ManualBookingDetail from '@/modules/bookings/ManualBookingDetail';

export default function ManualBookingDetailPage({ params }) {
  const router = useRouter();
  const { id } = use(params);

  const { data: raw, isLoading, isError, refetch } = useQuery({
    queryKey: ['manual-booking', id],
    queryFn:  () => bookingsService.getManualById(id).then(r => r.data.data),
    retry: 1,
  });

  return (
    <PageGuard module="bookings">
      <div className="animate-fadeIn">
        <button
          onClick={() => router.push('/bookings?tab=manual')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition mb-4"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Manual Bookings
        </button>

        {isLoading && <LoadingSpinner fullPage />}

        {isError && (
          <div className="card p-8 flex flex-col items-center gap-4 text-center">
            <p className="text-sm font-semibold text-gray-700">Manual booking not found</p>
            <Button variant="secondary" onClick={() => router.push('/bookings?tab=manual')}>Back</Button>
          </div>
        )}

        {raw && (
          <ManualBookingDetail booking={raw} onMutated={refetch} />
        )}
      </div>
    </PageGuard>
  );
}
