'use client';
import PageGuard from '@/components/ui/PageGuard';
import InvoiceServiceList from '@/modules/invoiceServices/InvoiceServiceList';
export default function InvoiceServicesPage() {
  return <PageGuard module="invoiceServices"><InvoiceServiceList /></PageGuard>;
}
