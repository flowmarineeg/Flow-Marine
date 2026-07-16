'use client';
import { use } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { bookingsService } from '@/services/bookings.service';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import BookingDetailCard from '@/modules/bookings/BookingDetailCard';

function BookingDetailContent({ id }) {
  const router = useRouter();
  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingsService.getById(id).then(r => r.data.data),
  });

  if (isLoading) return <LoadingSpinner fullPage />;
  if (isError || !booking) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-sm">Booking not found</p>
        <button onClick={() => router.push('/bookings')} className="mt-3 text-sm text-teal-600 hover:underline">
          ← Back to Bookings
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => router.push('/bookings')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Bookings
        </button>
        <span className="text-gray-200">/</span>
        <span className="mono text-sm font-bold text-gray-600">{booking.bookingNumber}</span>
      </div>
      <BookingDetailCard booking={booking} onMutated={refetch} />
    </div>
  );
}

export default function BookingDetailPage({ params }) {
  const { id } = use(params);
  return <PageGuard module="bookings"><BookingDetailContent id={id} /></PageGuard>;
}
