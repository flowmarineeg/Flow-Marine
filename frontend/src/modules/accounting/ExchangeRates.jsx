'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { accountingService } from '@/services/accounting.service';
import { usePermission } from '@/context/PermissionContext';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const lc = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

export default function ExchangeRates() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), from: '', to: 'USD', rate: '' });

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => accountingService.listRates().then(r => r.data.data),
  });
  const save = useMutation({
    mutationFn: () => accountingService.setRate({ ...form, from: form.from.toUpperCase(), to: form.to.toUpperCase(), rate: Number(form.rate) }),
    onSuccess: () => { toast.success('Exchange rate saved'); qc.invalidateQueries({ queryKey: ['exchange-rates'] }); setForm(f => ({ ...f, rate: '' })); },
    onError: (e) => showErrorToast(e, 'save'),
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = /^[A-Za-z]{3}$/.test(form.from) && /^[A-Za-z]{3}$/.test(form.to) && Number(form.rate) > 0 && form.date;

  if (isLoading) return <LoadingSpinner />;
  return (
    <div>
      {can('ledger', 'manage') && (
        <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
          <div><label className={lc}>Date</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="input-base" /></div>
          <div><label className={lc}>From</label><input maxLength={3} value={form.from} onChange={e => set('from', e.target.value)} placeholder="EGP" className="input-base uppercase" style={{ width: 90 }} /></div>
          <div><label className={lc}>To</label><input maxLength={3} value={form.to} onChange={e => set('to', e.target.value)} className="input-base uppercase" style={{ width: 90 }} /></div>
          <div><label className={lc}>Rate</label><input type="number" min="0" step="any" value={form.rate} onChange={e => set('rate', e.target.value)} className="input-base" style={{ width: 130 }} /></div>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>Save rate</Button>
        </div>
      )}
      <div className="card overflow-hidden">
        {rates.length === 0 ? <p className="p-6 text-sm text-gray-400">No exchange rates yet.</p> : (
          <table className="w-full border-collapse">
            <thead><tr className="table-header">{['Date', 'From', 'To', 'Rate', 'Source'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rates.map(r => (
                <tr key={r._id} className="table-row">
                  <td>{String(r.date).split('T')[0]}</td><td className="mono">{r.from}</td><td className="mono">{r.to}</td>
                  <td className="mono">{r.rate}</td><td className="text-xs text-gray-500">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
