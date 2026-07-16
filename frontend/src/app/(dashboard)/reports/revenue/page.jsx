'use client';
import PageGuard from '@/components/ui/PageGuard';
import RevenueReport from '@/modules/reports/RevenueReport';
export default function RevenueReportPage() {
  return <PageGuard module="reports"><RevenueReport /></PageGuard>;
}
