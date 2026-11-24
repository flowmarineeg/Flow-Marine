'use client';
import { Suspense } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import BookingList from '@/modules/bookings/BookingList';
// BookingList keeps the section / vessel / round in the URL (useSearchParams), so it needs a Suspense boundary.
export default function BookingsPage() {
  return (
    <PageGuard module="bookings">
      <Suspense fallback={<LoadingSpinner fullPage />}><BookingList /></Suspense>
    </PageGuard>
  );
}
