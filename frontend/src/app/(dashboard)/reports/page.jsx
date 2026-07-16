'use client';
import PageGuard from '@/components/ui/PageGuard';
import ReportsHubPage from '@/modules/reports/ReportsHub';
export default function ReportsPage() {
  return <PageGuard module="reports"><ReportsHubPage /></PageGuard>;
}
