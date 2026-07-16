'use client';
import PageGuard from '@/components/ui/PageGuard';
import VoyagePerformanceReport from '@/modules/reports/VoyagePerformanceReport';
export default function VoyagePerformancePage() {
  return <PageGuard module="reports"><VoyagePerformanceReport /></PageGuard>;
}
