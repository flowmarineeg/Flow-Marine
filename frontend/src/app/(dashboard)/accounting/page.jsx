'use client';
import PageGuard from '@/components/ui/PageGuard';
import AccountingPage from '@/modules/accounting/AccountingPage';
export default function AccountingRoute() {
  return <PageGuard module="accounting"><AccountingPage /></PageGuard>;
}
