'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { invoicesService } from '@/services/invoices.service';
import { PAYMENT_METHODS } from '@/utils/constants';

// Sprint 033 Revision 4 — the backend still requires explicit per-booking
// allocations (Payment.allocations[]) — a payment must state exactly which
// booking(s) it covers and how much for each; this is unchanged and still
// enforced/re-validated server-side (payment.service.js), since other
// features (Agent Financial Account's per-booking paid/remaining, orphaned-
// booking tracking) depend on that real per-booking breakdown existing.
//
// Sprint 047 — the RECORD PAYMENT form itself now presents the invoice as
// one whole (one Amount-to-Apply input, capped at the invoice's total
// remaining balance) rather than a row per booking. On submit, that single
// amount is auto-distributed into the required per-booking allocations[]
// via a deterministic waterfall: fill the first booking's own remaining
// balance, then the next, and so on, in the order the bookings already
// appear on the invoice — never a proportional/percentage split.
//
// Post-audit correction (system-audit-2026-8-3.md §3.3): an earlier
// version of this comment claimed the payment HISTORY table's per-booking
// "Applied To" breakdown was left unchanged by this redesign — that was
// wrong. It was explicitly removed, by the same explicit instruction that
// asked for "each payment record in one row" here — the table below is
// deliberately record-level only (date/amount/method/reference/status),
// no per-booking breakdown. `Payment.allocations[]` itself still exists
// and is still fully validated server-side (Agent Financial Account's
// per-booking paid/remaining still reads it) — only this table's display
// of it was removed, on purpose.

const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const PAYABLE_STATUSES = ['Issued', 'Partially Paid', 'Overdue'];

export default function InvoicePaymentPanel({ invoice }) {
  const qc = useQueryClient();
  const [amountToApply, setAmountToApply] = useState('');
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
      setAmountToApply('');
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

  // Total remaining across every booking on this invoice — the cap for the
  // single Amount-to-Apply input.
  const totalRemaining = (invoice.lineItems || []).reduce((s, li) => s + remainingFor(li), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = Number(amountToApply);
    if (!amt || amt <= 0) return toast.error('Enter an amount to apply');
    if (amt > totalRemaining) return toast.error('Amount exceeds the invoice\'s remaining balance');
    if (!paymentDate) return toast.error('Payment date is required');

    // Waterfall: fill each booking's own remaining balance in order, until
    // the entered amount is exhausted. Never a proportional split.
    let left = amt;
    const allocations = [];
    for (const li of (invoice.lineItems || [])) {
      if (left <= 0) break;
      const rem = remainingFor(li);
      if (rem <= 0) continue;
      const take = Math.min(rem, left);
      allocations.push({ bookingId: li.bookingId?._id || li.bookingId, amount: take });
      left -= take;
    }
    if (!allocations.length) return toast.error('No remaining balance to apply');

    createMutation.mutate({ allocations, paymentDate, method, reference, notes });
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-5">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Payments</p>

      {/* Sprint 047 — overview total, always visible regardless of invoice
          status (unlike the Record Payment form below, which only shows
          while the invoice is still payable) */}
      <div className="flex flex-wrap gap-6">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total Paid</p>
          <p className="text-sm font-bold text-green-700">{fmtMoney(invoice.paidAmount)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Remaining</p>
          <p className="text-sm font-bold text-amber-700">{fmtMoney(invoice.balanceAmount)}</p>
        </div>
      </div>

      {/* Payment history — record data only: date, amount, method,
          reference, status. No per-booking allocation breakdown. */}
      {isLoading ? <p className="text-sm text-gray-400">Loading…</p> : (
        (payments || []).length === 0 ? (
          <p className="text-sm text-gray-400 italic">No payments recorded yet.</p>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="table-header">{['Date', 'Amount', 'Method', 'Reference',  'Status', ''].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p._id} className="table-row">
                      <td className="text-xs text-gray-600">{fmtDate(p.paymentDate)}</td>
                      <td className="text-xs font-semibold text-gray-700">{fmtMoney(p.amount)}</td>
                      <td className="text-xs text-gray-600">{p.method}</td>
                      <td className="text-xs text-gray-400">{p.reference || '—'}</td>
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

          {/* Sprint 047 — one row over the whole invoice, not per booking */}
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center gap-6">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Invoice Total</p>
              <p className="text-sm font-bold text-gray-700">{fmtMoney(invoice.totalAmount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Paid So Far</p>
              <p className="text-sm font-bold text-green-700">{fmtMoney(invoice.paidAmount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Remaining</p>
              <p className="text-sm font-bold text-amber-700">{fmtMoney(totalRemaining)}</p>
            </div>
            <div className="ml-auto">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Amount to Apply <span className="text-red-400">*</span>
              </label>
              <input
                type="number" min="0" step="0.01" max={totalRemaining}
                disabled={totalRemaining <= 0}
                value={amountToApply}
                onChange={e => setAmountToApply(e.target.value)}
                placeholder="0.00"
                className="w-32 text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500 disabled:bg-gray-50 disabled:text-gray-300"
              />
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
            <span className="text-sm text-gray-500">Total to record: <b className="text-teal-700">{fmtMoney(Number(amountToApply) || 0)}</b></span>
            <button type="submit" disabled={createMutation.isPending || !(Number(amountToApply) > 0)} className="btn btn-primary btn-md">
              {createMutation.isPending ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
