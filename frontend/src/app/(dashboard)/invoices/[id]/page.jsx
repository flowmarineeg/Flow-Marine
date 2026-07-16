'use client';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import PageGuard from '@/components/ui/PageGuard';
import { invoicesService } from '@/services/invoices.service';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PageHeader from '@/components/ui/PageHeader';
import InvoiceForm from '@/modules/invoices/InvoiceForm';
import Badge from '@/components/ui/Badge';

function EditInvoiceContent({ id }) {
  const router = useRouter();
  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoicesService.getById(id).then(r => r.data.data),
  });

  if (isLoading) return <LoadingSpinner fullPage />;
  if (isError || !invoice) return (
    <div className="flex flex-col items-center py-24 text-gray-400">
      <p className="text-sm">Invoice not found</p>
      <button onClick={() => router.push('/invoices')} className="mt-3 text-sm text-teal-600 hover:underline">← Back</button>
    </div>
  );

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
        <span className="mono text-sm font-bold text-gray-600">{invoice.invoiceNumber}</span>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <PageHeader title={invoice.invoiceNumber} subtitle={invoice.bookingId?.bookingNumber} />
        <Badge label={invoice.status} />
      </div>
      <InvoiceForm item={invoice} />
    </div>
  );
}

export default function EditInvoicePage({ params }) {
  const { id } = use(params);
  return <PageGuard module="invoices"><EditInvoiceContent id={id} /></PageGuard>;
}
