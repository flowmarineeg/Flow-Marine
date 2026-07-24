'use client';
import PageGuard from '@/components/ui/PageGuard';
import BookingRevenueDetailsReport from '@/modules/reports/BookingRevenueDetailsReport';
export default function BookingRevenueDetailsPage() {
  return <PageGuard module="reports"><BookingRevenueDetailsReport /></PageGuard>;
}
