'use client';
import PageGuard from '@/components/ui/PageGuard';
import BookingImport from '@/modules/bookings/BookingImport';
export default function BookingImportPage() {
  return <PageGuard module="bookings" action="import"><BookingImport /></PageGuard>;
}
