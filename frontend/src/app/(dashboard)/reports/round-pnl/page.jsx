'use client';
import PageGuard from '@/components/ui/PageGuard';
import RoundPnlReport from '@/modules/reports/RoundPnlReport';
export default function RoundPnlPage() {
  return <PageGuard module="reports"><RoundPnlReport /></PageGuard>;
}
