'use client';
import PageGuard from '@/components/ui/PageGuard';
import BookingReport from '@/modules/reports/BookingReport';
export default function BookingReportPage() {
  return <PageGuard module="reports"><BookingReport /></PageGuard>;
}
