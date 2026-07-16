'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { invoicesService } from '@/services/invoices.service';
import { bookingsService } from '@/services/bookings.service';
import { agentsService }   from '@/services/agents.service';
import { INVOICE_STATUS }  from '@/utils/constants';

// Valid next transitions (mirrors backend)
const TRANSITIONS = {
  Draft:     ['Issued', 'Cancelled'],
  Issued:    ['Paid', 'Overdue', 'Cancelled'],
  Overdue:   ['Paid', 'Cancelled'],
  Paid:      [],
  Cancelled: [],
};

const ic = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ec = 'mt-1 text-[11px] text-red-500';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';

export default function InvoiceForm({ item }) {
  const router    = useRouter();
  const qc        = useQueryClient();
  const isEditing = !!item;
  const isPaid    = item?.status === 'Paid';

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      bookingId:   item?.bookingId?._id  || item?.bookingId  || '',
      agentId:     item?.agentId?._id    || item?.agentId    || '',
      invoiceDate: item?.invoiceDate ? item.invoiceDate.slice(0, 10) : '',
      dueDate:     item?.dueDate     ? item.dueDate.slice(0, 10)     : '',
      amount:      item?.amount      || '',
      currency:    item?.currency    || 'USD',
      status:      item?.status      || 'Draft',
      notes:       item?.notes       || '',
    },
  });

  const watchedBookingId = watch('bookingId');
  const watchedStatus    = watch('status');

  /* ── Booking dropdown ────────────────────────────────────────────────────── */
  const { data: bkData } = useQuery({
    queryKey: ['bookings-dd'],
    queryFn:  () => bookingsService.list({ limit: 200 }).then(r => r.data.data),
  });
  const bookings = (bkData || []).filter(b => b.status !== 'Cancelled');

  /* ── Agent dropdown ──────────────────────────────────────────────────────── */
  const { data: agData } = useQuery({
    queryKey: ['agents-dd'],
    queryFn:  () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
  });
  const agents = agData || [];

  /* ── Auto-fill agent from booking ───────────────────────────────────────── */
  const selectedBooking = bookings.find(b => b._id === watchedBookingId);
  useEffect(() => {
    if (!isEditing && selectedBooking?.agentId) {
      const aid = selectedBooking.agentId?._id || selectedBooking.agentId;
      setValue('agentId', aid);
      if (selectedBooking.totalFreight) setValue('amount', selectedBooking.totalFreight);
    }
  }, [watchedBookingId, selectedBooking, isEditing, setValue]);

  /* ── Allowed status options ──────────────────────────────────────────────── */
  const allowedStatuses = isEditing
    ? [item.status, ...(TRANSITIONS[item.status] || [])]
    : INVOICE_STATUS.filter(s => s !== 'Paid' && s !== 'Overdue');

  /* ── Save ────────────────────────────────────────────────────────────────── */
  const mutation = useMutation({
    mutationFn: (data) =>
      isEditing ? invoicesService.update(item._id, data) : invoicesService.create(data),
    onSuccess: () => {
      toast.success(isEditing ? 'Invoice updated' : 'Invoice created');
      qc.invalidateQueries(['invoices']);
      router.push('/invoices');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Save failed'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-5 max-w-2xl">

      {/* Paid warning */}
      {isPaid && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p className="text-sm text-green-700 font-medium">This invoice is Paid and cannot be modified.</p>
        </div>
      )}

      {/* ── Booking section ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Booking</p>

        <div>
          <label className={lc}>Booking <span className="text-red-400">*</span></label>
          <select
            {...register('bookingId', { required: 'Booking is required' })}
            disabled={isEditing || isPaid}
            className={`${ic(errors.bookingId)} ${isEditing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <option value="">Select booking…</option>
            {bookings.map(b => (
              <option key={b._id} value={b._id}>
                {b.bookingNumber} — {b.shipper} ({b.status})
              </option>
            ))}
          </select>
          {errors.bookingId && <p className={ec}>{errors.bookingId.message}</p>}
          {isEditing && <p className="mt-1 text-[11px] text-amber-500">Booking cannot be changed on an existing invoice</p>}
        </div>

        {/* Booking summary strip */}
        {selectedBooking && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Booking No',     val: <span className="mono font-bold text-teal-600">{selectedBooking.bookingNumber}</span> },
              { label: 'Status',         val: selectedBooking.status },
              { label: 'Total Freight',  val: fmtMoney(selectedBooking.totalFreight) },
              { label: 'Shipper',        val: selectedBooking.shipper },
              { label: 'Consignee',      val: selectedBooking.consignee },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-[13px] font-medium text-gray-700 truncate">{val}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Invoice details ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Invoice Details</p>

        <div>
          <label className={lc}>Agent <span className="text-red-400">*</span></label>
          <select
            {...register('agentId', { required: 'Agent is required' })}
            disabled={isPaid}
            className={`${ic(errors.agentId)} cursor-pointer`}
          >
            <option value="">Select agent…</option>
            {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode} — {a.agentName}</option>)}
          </select>
          {errors.agentId && <p className={ec}>{errors.agentId.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lc}>Invoice Date <span className="text-red-400">*</span></label>
            <input type="date"
              {...register('invoiceDate', { required: 'Invoice date is required' })}
              disabled={isPaid}
              className={ic(errors.invoiceDate)}
            />
            {errors.invoiceDate && <p className={ec}>{errors.invoiceDate.message}</p>}
          </div>
          <div>
            <label className={lc}>Due Date <span className="text-red-400">*</span></label>
            <input type="date"
              {...register('dueDate', { required: 'Due date is required' })}
              disabled={isPaid}
              className={ic(errors.dueDate)}
            />
            {errors.dueDate && <p className={ec}>{errors.dueDate.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lc}>Amount <span className="text-red-400">*</span></label>
            <input type="number" min="0" step="0.01"
              {...register('amount', { required: 'Amount is required', min: { value: 0, message: 'Min 0' } })}
              disabled={isPaid}
              className={ic(errors.amount)}
            />
            {errors.amount && <p className={ec}>{errors.amount.message}</p>}
          </div>
          <div>
            <label className={lc}>Currency <span className="text-red-400">*</span></label>
            <input
              {...register('currency', { required: 'Currency is required' })}
              placeholder="USD"
              disabled={isPaid}
              className={`${ic(errors.currency)} uppercase`}
            />
            {errors.currency && <p className={ec}>{errors.currency.message}</p>}
          </div>
        </div>

        <div>
          <label className={lc}>Status</label>
          <select {...register('status')} disabled={isPaid} className={`${ic(false)} cursor-pointer`}>
            {allowedStatuses.map(s => (
              <option key={s} value={s}>{s}{isEditing && s === item.status ? ' (current)' : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={lc}>Notes</label>
          <textarea {...register('notes')} rows={3} placeholder="Optional notes…" disabled={isPaid} className={`${ic(false)} resize-none`} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => router.push('/invoices')} className="btn btn-secondary btn-md">
          Cancel
        </button>
        <button type="submit" disabled={mutation.isPending || isPaid} className="btn btn-primary btn-md flex items-center gap-1.5">
          {mutation.isPending ? (
            <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving…</>
          ) : isEditing ? 'Save Changes' : 'Create Invoice'}
        </button>
      </div>
    </form>
  );
}
