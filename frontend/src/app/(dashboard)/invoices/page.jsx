'use client';
import PageGuard from '@/components/ui/PageGuard';
import InvoiceList from '@/modules/invoices/InvoiceList';
export default function InvoicesPage() {
  return <PageGuard module="invoices"><InvoiceList /></PageGuard>;
}
