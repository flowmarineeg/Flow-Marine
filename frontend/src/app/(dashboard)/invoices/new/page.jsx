'use client';
import { useRouter } from 'next/navigation';
import PageGuard from '@/components/ui/PageGuard';
import PageHeader from '@/components/ui/PageHeader';
import InvoiceWizardV2 from '@/modules/invoices/InvoiceWizardV2';

function NewInvoiceContent() {
  const router = useRouter();
  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => router.push('/invoices')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Invoices
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-700">New Invoice</span>
      </div>
      <PageHeader title="New Invoice" subtitle="Invoice a Booking, Voyage, or Round of Final Loading bookings" />
      <InvoiceWizardV2 />
    </div>
  );
}

export default function NewInvoicePage() {
  return <PageGuard module="invoices" action="create"><NewInvoiceContent /></PageGuard>;
}
