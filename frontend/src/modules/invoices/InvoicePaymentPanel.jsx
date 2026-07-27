'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { invoicesService } from '@/services/invoices.service';
import { PAYMENT_METHODS } from '@/utils/constants';

// Sprint 033 Revision 4 — explicit per-line-item allocation. A payment
// states exactly which booking(s) it covers and how much for each; there is
// no lump "amount" field entered separately — it is always the sum of what
// the user enters per row.

const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const PAYABLE_STATUSES = ['Issued', 'Partially Paid', 'Overdue'];

export default function InvoicePaymentPanel({ invoice }) {
  const qc = useQueryClient();
  const [amounts, setAmounts] = useState({}); // bookingId -> string
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const { data: payments, isLoading } = useQuery({
    queryKey: ['invoice-payments', invoice._id],
    queryFn: () => invoicesService.listPayments(invoice._id).then(r => r.data.data),
  });

  const canPay = PAYABLE_STATUSES.includes(invoice.status);

  // Exact per-booking remaining balance — computed from paidAmount already
  // returned per line item by the backend if present, else assumed 0 paid.
  // (InvoiceDetail passes the invoice with lineItems including freightAmount;
  // remaining here is a client-side helper only for input capping — the
  // server is always the source of truth and re-validates on submit.)
  const remainingFor = (li) => {
    const allocated = (payments || [])
      .filter(p => !p.isVoided)
      .flatMap(p => p.allocations)
      .filter(a => String(a.bookingId?._id || a.bookingId) === String(li.bookingId?._id || li.bookingId))
      .reduce((s, a) => s + a.amount, 0);
    return Math.max(0, li.freightAmount - allocated);
  };

  const createMutation = useMutation({
    mutationFn: (data) => invoicesService.createPayment(invoice._id, data),
    onSuccess: () => {
      toast.success('Payment recorded');
      setAmounts({});
      setReference(''); setNotes('');
      qc.invalidateQueries(['invoice-payments', invoice._id]);
      qc.invalidateQueries(['invoice', invoice._id]);
      qc.invalidateQueries(['invoices']);
    },
    onError: (e) => showErrorToast(e, 'payment'),
  });

  const voidMutation = useMutation({
    mutationFn: (paymentId) => invoicesService.voidPayment(invoice._id, paymentId, { voidReason: 'Voided from UI' }),
    onSuccess: () => {
      toast.success('Payment voided');
      qc.invalidateQueries(['invoice-payments', invoice._id]);
      qc.invalidateQueries(['invoice', invoice._id]);
      qc.invalidateQueries(['invoices']);
    },
    onError: (e) => showErrorToast(e, 'void'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const allocations = Object.entries(amounts)
      .filter(([, v]) => Number(v) > 0)
      .map(([bookingId, v]) => ({ bookingId, amount: Number(v) }));
    if (!allocations.length) return toast.error('Enter an amount for at least one booking');
    if (!paymentDate) return toast.error('Payment date is required');
    createMutation.mutate({ allocations, paymentDate, method, reference, notes });
  };

  const total = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-5">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Payments</p>

      {/* Payment history */}
      {isLoading ? <p className="text-sm text-gray-400">Loading…</p> : (
        (payments || []).length === 0 ? (
          <p className="text-sm text-gray-400 italic">No payments recorded yet.</p>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="table-header">{['Date', 'Amount', 'Method', 'Reference', 'Applied To', 'Status', ''].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p._id} className="table-row">
                      <td className="text-xs text-gray-600">{fmtDate(p.paymentDate)}</td>
                      <td className="text-xs font-semibold text-gray-700">{fmtMoney(p.amount)}</td>
                      <td className="text-xs text-gray-600">{p.method}</td>
                      <td className="text-xs text-gray-400">{p.reference || '—'}</td>
                      <td className="text-xs text-gray-500">
                        {p.allocations.map(a => `${a.bookingId?.bookingNumber || '—'} (${fmtMoney(a.amount)})`).join(', ')}
                      </td>
                      <td>{p.isVoided ? <span className="text-[11px] text-red-500 font-semibold">Voided</span> : <span className="text-[11px] text-green-600 font-semibold">Active</span>}</td>
                      <td>
                        {!p.isVoided && canPay && (
                          <button onClick={() => voidMutation.mutate(p._id)} className="text-xs text-red-400 hover:text-red-600">Void</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Record payment — per-line-item allocation */}
      {canPay && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-gray-200 pt-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Record Payment</p>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="table-header">{['Booking', 'Freight', 'Remaining'].map(h => <th key={h}>{h}</th>)}<th>Amount to Apply <span className="text-red-400">*</span></th></tr>
                </thead>
                <tbody>
                  {(invoice.lineItems || []).map(li => {
                    const remaining = remainingFor(li);
                    return (
                      <tr key={li._id} className="table-row">
                        <td className="mono text-xs font-semibold text-teal-600">{li.bookingNumber}</td>
                        <td className="text-xs text-gray-600">{fmtMoney(li.freightAmount)}</td>
                        <td className="text-xs text-amber-700">{fmtMoney(remaining)}</td>
                        <td>
                          <input
                            type="number" min="0" step="0.01" max={remaining}
                            disabled={remaining <= 0}
                            value={amounts[li.bookingId?._id || li.bookingId] || ''}
                            onChange={e => setAmounts(prev => ({ ...prev, [li.bookingId?._id || li.bookingId]: e.target.value }))}
                            placeholder="0.00"
                            className="w-28 text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500 disabled:bg-gray-50 disabled:text-gray-300"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Payment Date <span className="text-red-400 normal-case">*</span></label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Method <span className="text-red-400 normal-case">*</span></label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 cursor-pointer focus:outline-none focus:border-teal-500">
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Reference</label>
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Transaction ref…"
                className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-gray-500">Total to record: <b className="text-teal-700">{fmtMoney(total)}</b></span>
            <button type="submit" disabled={createMutation.isPending || total <= 0} className="btn btn-primary btn-md">
              {createMutation.isPending ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
