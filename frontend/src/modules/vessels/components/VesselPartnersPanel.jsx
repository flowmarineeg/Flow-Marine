'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { partnersService } from '@/services/partners.service';
import { usePermission } from '@/context/PermissionContext';
import Button from '@/components/ui/Button';

// Share is typed as a percentage (up to 2 decimals) and stored as integer basis points.
const pctToBp = (txt) => {
  const s = String(txt ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, f = ''] = s.split('.');
  return Number(i) * 100 + Number(f.padEnd(2, '0'));
};
const bpToPct = (bp) => (bp / 100).toFixed(2);

// Sprint050 P6 - JV Partners section on Vessel Details .
export default function VesselPartnersPanel({ vesselId }) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [rows, setRows] = useState(null); // null = show saved shares, array = editing

  const enabled = can('partners', 'read');

  const { data: shares = [] } = useQuery({
    queryKey: ['vessel-shares', vesselId],
    queryFn:  () => partnersService.getVesselShares(vesselId).then(r => r.data.data),
    enabled,
  });
  const { data: partners = [] } = useQuery({
    queryKey: ['partners-dropdown'],
    queryFn:  () => partnersService.list({ limit: 100, status: 'Active' }).then(r => r.data.data),
    enabled: enabled && rows !== null,
  });

  const save = useMutation({
    mutationFn: (payload) => partnersService.saveVesselShares(vesselId, payload),
    onSuccess: () => { toast.success('Partner shares saved'); setRows(null); qc.invalidateQueries({ queryKey: ['vessel-shares', vesselId] }); },
    onError:   (e) => showErrorToast(e, 'save'),
  });

  if (!enabled) return null;
  const canManage = can('partners', 'manage');

  const startEdit = () => setRows(
    shares.length
      ? shares.map(s => ({ partnerId: s.partnerId?._id || '', pct: bpToPct(s.shareBp) }))
      : [{ partnerId: '', pct: '' }]
  );
  const setRow = (i, patch) => setRows(r => r.map((x, k) => k === i ? { ...x, ...patch } : x));

  const totalBp = (rows || []).reduce((a, r) => a + (pctToBp(r.pct) || 0), 0);

  const submit = () => {
    const payload = rows.map(r => ({ partnerId: r.partnerId, shareBp: pctToBp(r.pct) }));
    if (payload.some(p => !p.partnerId || p.shareBp === null)) return toast.error('Every row needs a partner and a valid share');
    save.mutate(payload);
  };

  return (
    <div className="card" style={{ padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}>JV Partners</h3>
        {canManage && rows === null && <Button variant="secondary" onClick={startEdit}>{shares.length ? 'Edit Shares' : 'Set Shares'}</Button>}
      </div>

      {rows === null ? (
        shares.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No partner shares set for this vessel.</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr className="table-header"><th>Partner</th><th>Share</th></tr></thead>
              <tbody>
                {shares.map(s => (
                  <tr key={s._id} className="table-row">
                    <td>{s.partnerId?.name} <span className="mono" style={{ color: 'var(--text-muted)' }}>{s.partnerId?.code}</span></td>
                    <td>{bpToPct(s.shareBp)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={r.partnerId} onChange={e => setRow(i, { partnerId: e.target.value })}
                className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white" style={{ flex: 1 }}>
                <option value="">Select partner...</option>
                {partners.map(p => <option key={p._id} value={p._id}>{p.name} ({p.code})</option>)}
              </select>
              <input value={r.pct} onChange={e => setRow(i, { pct: e.target.value })} placeholder="%"
                className="text-[13px] border border-gray-200 rounded-lg px-3 py-2" style={{ width: 90 }} />
              <button type="button" onClick={() => setRows(x => x.filter((_, k) => k !== i))} style={{ color: '#991B1B', fontSize: 12 }}>Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <button type="button" onClick={() => setRows(r => [...r, { partnerId: '', pct: '' }])} style={{ fontSize: 12, color: 'var(--teal)' }}>+ Add partner</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: totalBp === 10000 ? '#065F46' : '#991B1B' }}>
              Total: {bpToPct(totalBp)}%
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" onClick={() => setRows(null)}>Cancel</Button>
            <Button onClick={submit} loading={save.isPending}>Save Shares</Button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Shares must total 100%,. They lock once the vessel has its first Round.</p>
        </div>
      )}
    </div>
  );
}
