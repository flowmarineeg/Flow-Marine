'use client';
import PageGuard from '@/components/ui/PageGuard';
import BookingList from '@/modules/bookings/BookingList';
export default function BookingsPage() {
  return <PageGuard module="bookings"><BookingList /></PageGuard>;
}
