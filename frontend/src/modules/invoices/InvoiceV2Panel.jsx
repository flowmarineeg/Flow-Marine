'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { invoicesService } from '@/services/invoices.service';
import { partnersService } from '@/services/partners.service';
import { usePermission } from '@/context/PermissionContext';
import BillToSection from './BillToSection';
import { toMinor, fromMinor, formatMoney } from '@/utils/money';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

const LABEL = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const INPUT = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition';
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '-');

// Sprint 051 - detail view + actions for a Version 2 invoice (invoice.v2 === true).
export default function InvoiceV2Panel({ invoice }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { can } = usePermission();
  const [dialog, setDialog] = useState(null); // 'settle' | 'credit' | 'debit' | 'cancel' | { void: settlement }
  const [form, setForm] = useState({});
  const set = (p) => setForm(f => ({ ...f, ...p }));

  const cur = invoice.currency;
  const balance = invoice.totalMinor - invoice.paidMinor - invoice.creditedMinor;
  const isNote = invoice.docKind !== 'Invoice';
  const posted = !['Draft', 'Cancelled'].includes(invoice.status);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['invoice', invoice._id] });
    qc.invalidateQueries({ queryKey: ['v2-settlements', invoice._id] });
    setDialog(null); setForm({});
  };

  const { data: settlements = [] } = useQuery({
    queryKey: ['v2-settlements', invoice._id],
    queryFn: () => invoicesService.listSettlements(invoice._id).then(r => r.data.data),
    enabled: posted,
  });
  const { data: partners = [] } = useQuery({
    queryKey: ['partners-dropdown'],
    queryFn: () => partnersService.list({ limit: 100, status: 'Active' }).then(r => r.data.data),
    enabled: dialog === 'settle',
  });

  const issue = useMutation({ mutationFn: () => invoicesService.issue(invoice._id), onSuccess: () => { toast.success('Invoice issued'); refresh(); }, onError: e => showErrorToast(e, 'update') });
  const remove = useMutation({ mutationFn: () => invoicesService.remove(invoice._id), onSuccess: () => { toast.success('Draft deleted'); router.push('/invoices'); }, onError: e => showErrorToast(e, 'delete') });
  const cancel = useMutation({ mutationFn: () => invoicesService.cancel(invoice._id, form.reason, !!form.cancelCommission), onSuccess: () => { toast.success('Invoice cancelled'); refresh(); }, onError: e => showErrorToast(e, 'update') });
  const settle = useMutation({
    mutationFn: () => invoicesService.recordSettlement(invoice._id, {
      amountMinor: toMinor(form.amount, cur), date: form.date || new Date().toISOString().slice(0, 10),
      method: form.method || 'Bank Transfer', reference: form.reference || null,
      bankAccount: form.partnerId ? { type: 'Partner', partnerId: form.partnerId } : { type: 'Company' },
    }),
    onSuccess: () => { toast.success('Settlement recorded'); refresh(); }, onError: e => showErrorToast(e, 'save'),
  });
  const voidIt = useMutation({
    mutationFn: () => invoicesService.voidSettlement(invoice._id, dialog.void._id, form.reason),
    onSuccess: () => { toast.success('Settlement voided'); refresh(); }, onError: e => showErrorToast(e, 'update'),
  });
  const note = useMutation({
    mutationFn: () => (dialog === 'credit' ? invoicesService.creditNote : invoicesService.debitNote)(invoice._id, {
      amountMinor: toMinor(form.amount, cur), reason: form.reason, dueDate: form.dueDate || undefined,
    }),
    onSuccess: () => { toast.success('Note issued'); refresh(); }, onError: e => showErrorToast(e, 'save'),
  });

  const amountOk = toMinor(form.amount, cur) > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 14 }}>
          {[['Total', invoice.totalMinor], ['Paid', invoice.paidMinor], ['Credited', invoice.creditedMinor], ['Open balance', balance]].map(([l, v]) => (
            <div key={l}><div className={LABEL}>{l}</div><div style={{ fontSize: 18, fontWeight: 700 }}>{formatMoney(v, cur)}</div></div>
          ))}
          <div><div className={LABEL}>Due</div><div style={{ fontSize: 14 }}>{fmtDate(invoice.dueDate)}</div></div>
        </div>
        {invoice.docKind !== 'Invoice' && <p style={{ fontSize: 13 }}><b>{invoice.docKind === 'CreditNote' ? 'Credit note' : 'Debit note'}</b>: {invoice.reason}</p>}
        {invoice.status === 'Cancelled' && <p style={{ fontSize: 13, color: '#991B1B' }}>Cancelled: {invoice.cancelReason}</p>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {invoice.status === 'Draft' && can('invoices', 'issue') && <Button onClick={() => issue.mutate()} loading={issue.isPending}>Issue invoice</Button>}
          {invoice.status === 'Draft' && can('invoices', 'delete') && <Button variant="secondary" onClick={() => remove.mutate()} loading={remove.isPending}>Delete draft</Button>}
          {posted && !isNote && balance > 0 && can('invoices', 'record') && <Button onClick={() => { setForm({}); setDialog('settle'); }}>Record settlement</Button>}
          {posted && !isNote && can('invoices', 'issue') && <Button variant="secondary" onClick={() => { setForm({}); setDialog('credit'); }}>Credit note</Button>}
          {posted && !isNote && can('invoices', 'issue') && <Button variant="secondary" onClick={() => { setForm({}); setDialog('debit'); }}>Debit note</Button>}
          {posted && !isNote && can('invoices', 'cancel') && <Button variant="secondary" onClick={() => { setForm({}); setDialog('cancel'); }}>Cancel invoice</Button>}
        </div>
        {posted && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Issued invoices are locked. Correct them with a credit or debit note.</p>}
      </div>

      {posted && !isNote && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Settlements</h3>
          {settlements.length === 0 ? <p className="text-sm text-gray-400">No settlements yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr className="table-header"><th>Date</th><th>Method</th><th>Received into</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {settlements.map(s => (
                  <tr key={s._id} className="table-row" style={{ opacity: s.status === 'Voided' ? 0.5 : 1 }}>
                    <td>{fmtDate(s.date)}</td><td>{s.method}</td>
                    <td>{s.bankAccount?.type === 'Partner' ? `Partner ${s.bankAccount.partnerId?.name || ''}` : 'Company bank'}</td>
                    <td>{s.reference || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(s.amountMinor, s.currency)}</td>
                    <td>{s.status}</td>
                    <td>{s.status === 'Posted' && can('invoices', 'record') && <button style={{ color: '#991B1B', fontSize: 12 }} onClick={() => { setForm({}); setDialog({ void: s }); }}>Void</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 20 }}><BillToSection key={invoice._id} item={invoice} /></div>

      <Modal open={dialog === 'settle'} onClose={() => setDialog(null)} title="Record settlement"
        footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Close</Button><Button disabled={!amountOk} loading={settle.isPending} onClick={() => settle.mutate()}>Record</Button></>}>
        <div className="flex flex-col gap-3">
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Open balance: {formatMoney(balance, cur)}. Over-payment is refused.</p>
          <div><label className={LABEL}>Amount ({cur})</label><input className={INPUT} value={form.amount || ''} onChange={e => set({ amount: e.target.value })} placeholder={fromMinor(balance, cur)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Date</label><input type="date" className={INPUT} value={form.date || new Date().toISOString().slice(0, 10)} onChange={e => set({ date: e.target.value })} /></div>
            <div><label className={LABEL}>Method</label>
              <select className={INPUT} value={form.method || 'Bank Transfer'} onChange={e => set({ method: e.target.value })}>
                {['Bank Transfer', 'Cash', 'Cheque', 'Other'].map(m => <option key={m}>{m}</option>)}
              </select></div>
          </div>
          <div><label className={LABEL}>Received into</label>
            <select className={INPUT} value={form.partnerId || ''} onChange={e => set({ partnerId: e.target.value })}>
              <option value="">Company bank</option>
              {partners.map(p => <option key={p._id} value={p._id}>Partner: {p.name}</option>)}
            </select></div>
          <div><label className={LABEL}>Reference</label><input className={INPUT} value={form.reference || ''} onChange={e => set({ reference: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={dialog === 'credit' || dialog === 'debit'} onClose={() => setDialog(null)} title={dialog === 'credit' ? 'Issue credit note' : 'Issue debit note'}
        footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Close</Button><Button disabled={!amountOk || !form.reason} loading={note.isPending} onClick={() => note.mutate()}>Issue</Button></>}>
        <div className="flex flex-col gap-3">
          <div><label className={LABEL}>Amount ({cur})</label><input className={INPUT} value={form.amount || ''} onChange={e => set({ amount: e.target.value })} /></div>
          {dialog === 'debit' && <div><label className={LABEL}>Due date</label><input type="date" className={INPUT} value={form.dueDate || ''} onChange={e => set({ dueDate: e.target.value })} /></div>}
          <div><label className={LABEL}>Reason <span className="text-red-400">*</span></label><textarea rows={2} className={INPUT} value={form.reason || ''} onChange={e => set({ reason: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel invoice"
        footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Keep</Button><Button disabled={!form.reason} loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel invoice</Button></>}>
        <p style={{ fontSize: 12, marginBottom: 8 }}>This reverses the ledger entry and frees the items. Commission already accrued is kept unless you tick the box below.</p>
        {can('agents', 'commission') && (
          <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <input type="checkbox" checked={!!form.cancelCommission} onChange={e => set({ cancelCommission: e.target.checked })} /> Also cancel the commission accrued on this invoice
          </label>
        )}
        <label className={LABEL}>Reason <span className="text-red-400">*</span></label>
        <textarea rows={2} className={INPUT} value={form.reason || ''} onChange={e => set({ reason: e.target.value })} />
      </Modal>

      <Modal open={!!dialog?.void} onClose={() => setDialog(null)} title="Void settlement"
        footer={<><Button variant="secondary" onClick={() => setDialog(null)}>Keep</Button><Button disabled={!form.reason} loading={voidIt.isPending} onClick={() => voidIt.mutate()}>Void</Button></>}>
        <label className={LABEL}>Reason <span className="text-red-400">*</span></label>
        <textarea rows={2} className={INPUT} value={form.reason || ''} onChange={e => set({ reason: e.target.value })} />
      </Modal>
    </div>
  );
}
