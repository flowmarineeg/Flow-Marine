'use client';
import PageGuard from '@/components/ui/PageGuard';
import RoundCapacityReport from '@/modules/reports/RoundCapacityReport';
export default function RoundCapacityPage() {
  return <PageGuard module="reports"><RoundCapacityReport /></PageGuard>;
}
