'use client';
import PageGuard from '@/components/ui/PageGuard';
import ExpenseReport from '@/modules/reports/ExpenseReport';
export default function ExpenseReportPage() {
  return <PageGuard module="reports"><ExpenseReport /></PageGuard>;
}
