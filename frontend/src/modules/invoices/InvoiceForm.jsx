'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { invoicesService } from '@/services/invoices.service';
import { bookingsService } from '@/services/bookings.service';
import { agentsService }   from '@/services/agents.service';
import { useRounds }  from '@/hooks/useRounds';
import { voyagesService } from '@/services/voyages.service';
import { INVOICE_TYPES } from '@/utils/constants';
import EligibleBookingsTable from './EligibleBookingsTable';

// Sprint 033: an invoice now owns a SET of Final Loading bookings (Booking /
// Voyage / Round type), never a single hand-picked booking with a manual
// amount. Editing an existing invoice only touches its dates/currency/notes/
// status — its line items are fixed at creation time (see invoice.service.js).

const ic = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ec = 'mt-1 text-[11px] text-red-500';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';

// ── Editing an existing invoice — line items are fixed, only header fields move ─
function EditInvoiceForm({ item }) {
  const router = useRouter();
  const qc     = useQueryClient();
  const locked = item.status === 'Paid' || item.status === 'Cancelled' || item.paidAmount > 0;

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      invoiceDate: item.invoiceDate ? item.invoiceDate.slice(0, 10) : '',
      dueDate:     item.dueDate     ? item.dueDate.slice(0, 10)     : '',
      currency:    item.currency    || 'USD',
      notes:       item.notes       || '',
      status:      item.status,
    },
  });

  const allowedNext = { Draft: ['Draft', 'Issued', 'Cancelled'], Issued: ['Issued', 'Cancelled'] }[item.status] || [item.status];

  const mutation = useMutation({
    mutationFn: (data) => invoicesService.update(item._id, data),
    onSuccess: () => {
      toast.success('Invoice updated');
      qc.invalidateQueries(['invoices']);
      qc.invalidateQueries(['invoice', item._id]);
      router.push('/invoices');
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-5">
      {locked && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-700 font-medium">
            {item.paidAmount > 0 ? 'This invoice has recorded payments and cannot be modified.' : 'This invoice cannot be modified.'}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
          Line Items — {item.invoiceType} Invoice
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="table-header">
                {['Booking', 'Container', 'Voyage', 'Round', 'Freight'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(item.lineItems || []).map(li => (
                <tr key={li._id} className="table-row">
                  <td className="mono text-xs font-semibold text-teal-600">{li.bookingNumber}{li.orphaned && <span className="ml-1 text-red-500" title={li.orphanedReason}>⚠</span>}</td>
                  <td className="mono text-xs text-gray-600">{li.containerNumber || '—'}</td>
                  <td className="mono text-xs text-gray-500">{li.voyageNumber ? `${li.voyageNumber} (${li.voyageName || 'unnamed'})` : '—'}</td>
                  <td className="mono text-xs text-gray-500">{li.roundNumber ? `${li.roundNumber} (${li.roundName || 'unnamed'})` : '—'}</td>
                  <td className="text-xs text-gray-700">{fmtMoney(li.freightAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-4 text-xs">
          <span className="text-gray-500">Total <b className="text-gray-800 ml-1">{fmtMoney(item.totalAmount)}</b></span>
          <span className="text-gray-500">Paid <b className="text-green-700 ml-1">{fmtMoney(item.paidAmount)}</b></span>
          <span className="text-gray-500">Balance <b className="text-amber-700 ml-1">{fmtMoney(item.balanceAmount)}</b></span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Invoice Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lc}>Invoice Date</label>
            <input type="date" {...register('invoiceDate', { required: true })} disabled={locked} className={ic(errors.invoiceDate)} />
          </div>
          <div>
            <label className={lc}>Due Date</label>
            <input type="date" {...register('dueDate', { required: true })} disabled={locked} className={ic(errors.dueDate)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lc}>Currency</label>
            <input {...register('currency', { required: true })} disabled={locked} className={`${ic(errors.currency)} uppercase`} />
          </div>
          <div>
            <label className={lc}>Status</label>
            <select {...register('status')} disabled={locked} className={`${ic(false)} cursor-pointer`}>
              {allowedNext.map(s => <option key={s} value={s}>{s}{s === item.status ? ' (current)' : ''}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={lc}>Notes</label>
          <textarea {...register('notes')} rows={3} disabled={locked} className={`${ic(false)} resize-none`} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => router.push('/invoices')} className="btn btn-secondary btn-md">Cancel</button>
        <button type="submit" disabled={mutation.isPending || locked} className="btn btn-primary btn-md">
          {mutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

// ── Creating a new invoice — Booking / Voyage / Round composition ─────────────
function CreateInvoiceForm() {
  const router = useRouter();
  const qc     = useQueryClient();

  const [invoiceType, setInvoiceType] = useState('Booking');
  const [agentId, setAgentId]         = useState('');
  const [roundId, setRoundId]         = useState('');
  const [voyageId, setVoyageId]       = useState('');
  const [selected, setSelected]       = useState([]); // bookingIds
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate]         = useState('');
  const [currency, setCurrency]       = useState('USD');
  const [notes, setNotes]             = useState('');

  // Reset downstream selections whenever the scope changes
  useEffect(() => { setVoyageId(''); setSelected([]); }, [roundId, invoiceType]);
  useEffect(() => { setSelected([]); }, [voyageId, agentId]);

  const { data: agData } = useQuery({
    queryKey: ['agents-dd'],
    queryFn:  () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
  });
  const agents = agData || [];

  const { rounds } = useRounds();
  const { data: voyageData } = useQuery({
    queryKey: ['voyages-dropdown', roundId],
    queryFn:  () => voyagesService.list({ roundId, limit: 200 }).then(r => r.data.data),
    enabled:  !!roundId,
  });
  const voyages = (voyageData || []).filter(v => v.status !== 'Cancelled');

  // Booking-type: agent's own Final Loading bookings, direct dropdown
  const { data: flBookings } = useQuery({
    queryKey: ['fl-bookings-dd', agentId],
    queryFn:  () => bookingsService.list({ limit: 200, agentId, status: 'Final Loading' }).then(r => r.data.data),
    enabled:  invoiceType === 'Booking' && !!agentId,
  });

  // Voyage/Round-type: eligible-bookings composition table
  const { data: eligible, isFetching: eligibleLoading } = useQuery({
    queryKey: ['eligible-bookings', agentId, invoiceType, voyageId, roundId],
    queryFn:  () => invoicesService.getEligibleBookings(
      invoiceType === 'Voyage' ? { agentId, voyageId } : { agentId, roundId }
    ).then(r => r.data.data),
    enabled: !!agentId && (
      (invoiceType === 'Voyage' && !!voyageId) ||
      (invoiceType === 'Round'  && !!roundId)
    ),
  });

  const toggleBooking = (bookingId) => {
    setSelected(prev => prev.includes(bookingId) ? prev.filter(id => id !== bookingId) : [...prev, bookingId]);
  };

  const mutation = useMutation({
    mutationFn: (data) => invoicesService.create(data),
    onSuccess: () => {
      toast.success('Invoice created');
      qc.invalidateQueries(['invoices']);
      router.push('/invoices');
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!agentId)                   return toast.error('Select an agent');
    if (!selected.length)            return toast.error('Select at least one booking');
    if (!invoiceDate || !dueDate)    return toast.error('Invoice date and due date are required');

    mutation.mutate({
      invoiceType, agentId,
      voyageId: invoiceType === 'Voyage' ? voyageId : undefined,
      roundId:  invoiceType === 'Round'  ? roundId  : undefined,
      bookingIds: selected,
      invoiceDate, dueDate, currency, notes,
    });
  };

  const eligibleRows = eligible || [];
  const flRows = (flBookings || []).filter(b => b.status === 'Final Loading');

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ── Invoice Type ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Invoice Type</p>
        <div className="flex gap-2">
          {INVOICE_TYPES.map(tp => (
            <button
              key={tp} type="button"
              onClick={() => setInvoiceType(tp)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                invoiceType === tp ? 'bg-teal-50 border-teal-400 text-teal-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {tp}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">
          Only <b>Final Loading</b> bookings can be invoiced — Pending and Confirmed bookings are never eligible.
        </p>
      </div>

      {/* ── Scope ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Scope</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={lc}>Agent <span className="text-red-400">*</span></label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} className={`${ic(false)} cursor-pointer`}>
              <option value="">Select agent…</option>
              {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode} — {a.agentName}</option>)}
            </select>
          </div>
          {(invoiceType === 'Voyage' || invoiceType === 'Round') && (
            <div>
              <label className={lc}>Round <span className="text-red-400">*</span></label>
              <select value={roundId} onChange={e => setRoundId(e.target.value)} className={`${ic(false)} cursor-pointer`}>
                <option value="">Select round…</option>
                {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
              </select>
            </div>
          )}
          {invoiceType === 'Voyage' && (
            <div>
              <label className={lc}>Voyage <span className="text-red-400">*</span></label>
              <select value={voyageId} onChange={e => setVoyageId(e.target.value)} disabled={!roundId} className={`${ic(false)} cursor-pointer`}>
                <option value="">Select voyage…</option>
                {voyages.map(v => <option key={v._id} value={v._id}>{v.voyageNumber} ({v.voyageName || 'unnamed'})</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Booking selection ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-3">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Final Loading Bookings</p>

        {invoiceType === 'Booking' && (
          !agentId ? <p className="text-sm text-gray-400 italic py-4 text-center">Select an agent first.</p> :
          flRows.length === 0 ? <p className="text-sm text-gray-400 italic py-4 text-center">No Final Loading bookings for this agent.</p> : (
            <div className="flex flex-col gap-2">
              {flRows.map(b => (
                <label key={b._id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition ${selected.includes(b._id) ? 'border-teal-400 bg-teal-50/50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <input type="radio" name="single-booking" checked={selected.includes(b._id)}
                    onChange={() => setSelected([b._id])} className="w-4 h-4 accent-teal-500" />
                  <span className="mono text-xs font-bold text-teal-600">{b.bookingNumber}</span>
                  <span className="text-xs text-gray-500">{b.shipper}</span>
                  <span className="ml-auto text-xs font-semibold text-gray-700">{fmtMoney(b.totalFreight)}</span>
                </label>
              ))}
            </div>
          )
        )}

        {(invoiceType === 'Voyage' || invoiceType === 'Round') && (
          !agentId || (invoiceType === 'Voyage' ? !voyageId : !roundId)
            ? <p className="text-sm text-gray-400 italic py-4 text-center">Select an agent and {invoiceType === 'Voyage' ? 'voyage' : 'round'} to see eligible bookings.</p>
            : eligibleLoading
              ? <p className="text-sm text-gray-400 italic py-4 text-center">Loading…</p>
              : <EligibleBookingsTable bookings={eligibleRows} selected={selected} onToggle={toggleBooking} />
        )}
      </div>

      {/* ── Invoice details ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Invoice Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lc}>Invoice Date <span className="text-red-400">*</span></label>
            <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={ic(false)} />
          </div>
          <div>
            <label className={lc}>Due Date <span className="text-red-400">*</span></label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={ic(false)} />
          </div>
        </div>
        <div>
          <label className={lc}>Currency <span className="text-red-400">*</span></label>
          <input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="USD" className={`${ic(false)} uppercase`} style={{ maxWidth: 160 }} />
        </div>
        <div>
          <label className={lc}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional notes…" className={`${ic(false)} resize-none`} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => router.push('/invoices')} className="btn btn-secondary btn-md">Cancel</button>
        <button type="submit" disabled={mutation.isPending} className="btn btn-primary btn-md">
          {mutation.isPending ? 'Creating…' : 'Create Invoice'}
        </button>
      </div>
    </form>
  );
}

export default function InvoiceForm({ item }) {
  return item ? <EditInvoiceForm item={item} /> : <CreateInvoiceForm />;
}
