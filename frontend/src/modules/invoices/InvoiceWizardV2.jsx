'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { invoicesService } from '@/services/invoices.service';
import { useAgents } from '@/hooks/useAgents';
import { useRounds } from '@/hooks/useRounds';
import { useVoyages } from '@/hooks/useVoyages';
import { usePermission } from '@/context/PermissionContext';
import { getVoyageLabel } from '@/utils/voyageLabel';
import { toMinor, formatMoney } from '@/utils/money';
import Button from '@/components/ui/Button';
import BookingsSummaryCard from '@/components/ui/BookingsSummaryCard';

const LABEL = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const INPUT = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition';
const STEPS = ['Party & scope', 'Items', 'Terms', 'Review'];
const today = () => new Date().toISOString().slice(0, 10);

// Sprint 051 R4 - four-step invoice wizard (V2).
export default function InvoiceWizardV2() {
  const router = useRouter();
  const { can } = usePermission();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    invoiceType: 'Voyage', billToAgentId: '', roundId: '', voyageId: '',
    invoiceDate: today(), dueDate: today(), currency: 'USD', notes: '',
  });
  const [deselected, setDeselected] = useState(new Set());
  const set = (patch) => setF(p => ({ ...p, ...patch }));

  const { agents } = useAgents();
  const { rounds } = useRounds();
  const { voyages } = useVoyages(f.roundId ? { roundId: f.roundId } : {});

  const scopeReady = f.billToAgentId && (f.invoiceType === 'Round' ? f.roundId : f.voyageId);
  const { data: items = [], isFetching } = useQuery({
    queryKey: ['v2-items', f.billToAgentId, f.invoiceType, f.roundId, f.voyageId],
    queryFn: () => invoicesService.listItems({
      billToAgentId: f.billToAgentId,
      ...(f.invoiceType === 'Round' ? { roundId: f.roundId } : { voyageId: f.voyageId }),
    }).then(r => r.data.data),
    enabled: !!scopeReady && step >= 1,
  });

  // Auto-select every eligible item (same rule as V1 Sprint 044); the user may untick.
  const chosen = useMemo(() => items.filter(i => !deselected.has(i._id)), [items, deselected]);
  const cur = (f.currency || 'USD').toUpperCase();
  const lineMinor = (i) => (toMinor(i.freightRate, cur) ?? 0) * i.loadedQty;
  const totalMinor = chosen.reduce((a, i) => a + lineMinor(i), 0);

  const create = useMutation({
    mutationFn: async (issueToo) => {
      const res = await invoicesService.createDraft({
        invoiceType: f.invoiceType, billToAgentId: f.billToAgentId,
        ...(f.invoiceType === 'Round' ? { roundId: f.roundId } : { voyageId: f.voyageId }),
        itemIds: chosen.map(i => i._id), invoiceDate: f.invoiceDate, dueDate: f.dueDate,
        currency: cur, notes: f.notes || null,
      });
      const inv = res.data.data;
      if (issueToo) await invoicesService.issue(inv._id);
      return inv;
    },
    onSuccess: (inv, issueToo) => {
      toast.success(issueToo ? 'Invoice issued' : 'Draft invoice created');
      router.push(`/invoices/${inv._id}`);
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  const canNext = [
    !!scopeReady,
    chosen.length > 0,
    !!f.invoiceDate && !!f.dueDate && f.dueDate >= f.invoiceDate && cur.length === 3,
  ][step];

  return (
    <div className="card" style={{ padding: 24, maxWidth: 820 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, textAlign: 'center',
            background: i === step ? 'var(--teal)' : i < step ? '#D1FAE5' : '#F3F4F6',
            color: i === step ? '#fff' : i < step ? '#065F46' : '#6B7280',
          }}>{i + 1}. {s}</div>
        ))}
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className={LABEL}>Bill-To party (agent) <span className="text-red-400">*</span></label>
            <select className={INPUT} value={f.billToAgentId} onChange={e => set({ billToAgentId: e.target.value })}>
              <option value="">Select agent...</option>
              {agents.map(a => <option key={a._id} value={a._id}>{a.agentName} ({a.agentCode})</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Invoice scope</label>
            <div style={{ display: 'flex', gap: 16 }}>
              {['Voyage', 'Round'].map(t => (
                <label key={t} style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="radio" checked={f.invoiceType === t} onChange={() => set({ invoiceType: t, voyageId: '' })} /> {t}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Round {f.invoiceType === 'Round' && <span className="text-red-400">*</span>}</label>
              <select className={INPUT} value={f.roundId} onChange={e => set({ roundId: e.target.value, voyageId: '' })}>
                <option value="">Select round...</option>
                {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber}{r.roundName ? ` - ${r.roundName}` : ''}</option>)}
              </select>
            </div>
            {f.invoiceType === 'Voyage' && (
              <div>
                <label className={LABEL}>Voyage <span className="text-red-400">*</span></label>
                <select className={INPUT} value={f.voyageId} onChange={e => set({ voyageId: e.target.value })}>
                  <option value="">Select voyage...</option>
                  {voyages.map(v => <option key={v._id} value={v._id}>{getVoyageLabel(v)}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Each row is a pricing group of Final Loaded containers. Every eligible item is included; untick any you want to leave out.
          </p>
          {isFetching ? <p className="text-sm text-gray-400">Loading items...</p> : items.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-6 text-center">Nothing is ready to invoice for this selection.</p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr className="table-header"><th></th><th>Voyage</th><th>Container type</th><th>Loaded</th><th>Rate</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {items.map(i => (
                    <tr key={i._id} className="table-row">
                      <td><input type="checkbox" checked={!deselected.has(i._id)} onChange={() => setDeselected(s => { const n = new Set(s); n.has(i._id) ? n.delete(i._id) : n.add(i._id); return n; })} /></td>
                      <td>{getVoyageLabel(i.voyageId)}</td>
                      <td>{i.containerTypeId ? `${i.containerTypeId.code} ${i.containerTypeId.size}` : '-'}</td>
                      <td>{i.loadedQty}</td>
                      <td>{i.freightRate}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(lineMinor(i), cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <BookingsSummaryCard
                bookings={chosen.flatMap(i => Array.from({ length: i.loadedQty }, () => ({
                  freightAmount: i.freightRate, containerType: i.containerTypeId ? `${i.containerTypeId.code} ${i.containerTypeId.size}` : null,
                })))}
              />
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div><label className={LABEL}>Invoice date</label><input type="date" className={INPUT} value={f.invoiceDate} onChange={e => set({ invoiceDate: e.target.value })} /></div>
            <div><label className={LABEL}>Due date</label><input type="date" className={INPUT} value={f.dueDate} onChange={e => set({ dueDate: e.target.value })} /></div>
            <div><label className={LABEL}>Currency</label><input className={`${INPUT} uppercase`} maxLength={3} value={f.currency} onChange={e => set({ currency: e.target.value.toUpperCase() })} /></div>
          </div>
          {cur !== 'USD' && <p style={{ fontSize: 12, color: '#991B1B' }}>Non-USD invoices need an exchange rate for the invoice date (Ledger → Exchange rates) before they can be issued.</p>}
          <div><label className={LABEL}>Notes</label><textarea rows={3} className={INPUT} value={f.notes} onChange={e => set({ notes: e.target.value })} /></div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3" style={{ fontSize: 13 }}>
            <div><b>{f.invoiceType}</b> invoice for <b>{agents.find(a => a._id === f.billToAgentId)?.agentName}</b></div>
            <div>{chosen.reduce((a, i) => a + i.loadedQty, 0)} containers in {chosen.length} item(s)</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{formatMoney(totalMinor, cur)}</div>
            <div style={{ color: 'var(--text-muted)' }}>Due {f.dueDate}</div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            A draft can still be edited or deleted. Issuing posts it to the ledger and locks it - corrections after that are credit/debit notes.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <Button variant="secondary" onClick={() => (step === 0 ? router.push('/invoices') : setStep(step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        {step < 3 ? (
          <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Next</Button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" loading={create.isPending} onClick={() => create.mutate(false)}>Save as Draft</Button>
            {can('invoices', 'issue') && (
              <Button loading={create.isPending} onClick={() => create.mutate(true)}>Create &amp; Issue</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
