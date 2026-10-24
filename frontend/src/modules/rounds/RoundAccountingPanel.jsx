'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { roundAccountingService } from '@/services/roundAccounting.service';
import { usePermission } from '@/context/PermissionContext';
import { downloadFile } from '@/utils/exportHelper';
import { toMinor, formatMoney } from '@/utils/money';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

const LABEL = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const INPUT = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition';
const CUR = 'USD';

// Sprint 053 S8 - Close Round wizard, Partner Settlement screen and JV reserve for one Round.
export default function RoundAccountingPanel({ round }) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [dlg, setDlg] = useState(null); // 'close' | 'reopen' | { unpay: transfer }
  const [f, setF] = useState({ carry: '', mode: 'Accrual', override: '', reason: '' });
  const set = (p) => setF(x => ({ ...x, ...p }));
  const closed = round.closeStatus === 'Closed';

  const { data: cl } = useQuery({
    queryKey: ['round-checklist', round._id, round.closeStatus],
    queryFn: () => roundAccountingService.checklist(round._id).then(r => r.data.data),
  });
  const { data: st } = useQuery({
    queryKey: ['round-settlement', round._id, round.closeStatus],
    queryFn: () => roundAccountingService.getSettlement(round._id, CUR).then(r => r.data.data),
  });
  const vesselId = round.vesselId?._id || round.vesselId;
  const { data: reserve } = useQuery({
    queryKey: ['vessel-reserve', vesselId],
    queryFn: () => roundAccountingService.vesselReserve(vesselId).then(r => r.data.data),
    enabled: !!vesselId,
  });

  const refresh = () => {
    ['round', 'round-checklist', 'round-settlement', 'vessel-reserve'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    qc.invalidateQueries({ queryKey: ['rounds'] });
    setDlg(null);
  };
  const ok = (msg) => () => { toast.success(msg); refresh(); };
  const calc = useMutation({ mutationFn: () => roundAccountingService.calculate(round._id, { mode: f.mode, carryForwardMinor: f.carry ? toMinor(f.carry, CUR) : 0, currency: CUR }), onSuccess: ok('Settlement calculated'), onError: e => showErrorToast(e, 'save') });
  const ready = useMutation({ mutationFn: () => roundAccountingService.markReady(round._id), onSuccess: ok('Marked ready to close'), onError: e => showErrorToast(e, 'update') });
  const close = useMutation({
    mutationFn: () => roundAccountingService.close(round._id, { mode: f.mode, carryForwardMinor: f.carry ? toMinor(f.carry, CUR) : 0, overrideReason: f.override || undefined, currency: CUR }),
    onSuccess: ok('Round closed'), onError: e => showErrorToast(e, 'update'),
  });
  const reopen = useMutation({ mutationFn: () => roundAccountingService.reopen(round._id, f.reason), onSuccess: ok('Round reopened'), onError: e => showErrorToast(e, 'update') });
  const pay = useMutation({ mutationFn: (id) => roundAccountingService.payTransfer(id, {}), onSuccess: ok('Transfer recorded as paid'), onError: e => showErrorToast(e, 'update') });
  const unpay = useMutation({ mutationFn: () => roundAccountingService.unpayTransfer(dlg.unpay._id, f.reason), onSuccess: ok('Payment reversed'), onError: e => showErrorToast(e, 'update') });

  const sheet = async () => {
    try { const r = await roundAccountingService.downloadSheet(round._id, CUR); downloadFile(r.data, `partner-settlement-${round.roundNumber}.xlsx`); }
    catch { toast.error('Download failed'); }
  };

  const hasPdaBlocker = cl?.blockers?.some(b => b.code === 'ROUND_HAS_OPEN_PDA');
  const canOverride = can('rounds', 'closeOverride');
  const carryMinor = f.carry ? toMinor(f.carry, CUR) : 0;

  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* ── Close ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>Financial close</h3>
          <span className="badge" style={{ background: closed ? '#FEE2E2' : round.closeStatus === 'ReadyToClose' ? '#FEF3C7' : '#D1FAE5', color: closed ? '#991B1B' : round.closeStatus === 'ReadyToClose' ? '#92400E' : '#065F46' }}>
            {closed ? 'Closed' : round.closeStatus === 'ReadyToClose' ? 'Ready to close' : 'Open'}
          </span>
        </div>
        {closed ? (
          <p style={{ fontSize: 13 }}>This Round is locked: bookings, expenses, invoices, tracking and settlements cannot change. {round.reopenReason && `Last reopened: ${round.reopenReason}`}</p>
        ) : cl && (
          <div className="flex flex-col gap-1" style={{ fontSize: 13 }}>
            {cl.blockers.length === 0 && <span style={{ color: '#065F46' }}>Nothing blocks closing this Round.</span>}
            {cl.blockers.map(b => <span key={b.code} style={{ color: '#991B1B' }}>Blocker: {b.count} {b.label}{b.overridable ? ' (can be overridden with a reason)' : ''}</span>)}
            {cl.warnings.map(w => <span key={w.code} style={{ color: '#92400E' }}>Warning: {w.count} {w.label}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {!closed && round.closeStatus !== 'ReadyToClose' && can('rounds', 'close') && <Button variant="secondary" loading={ready.isPending} disabled={!cl?.canClose} onClick={() => ready.mutate()}>Mark ready</Button>}
          {!closed && can('rounds', 'close') && <Button onClick={() => setDlg('close')}>Close Round...</Button>}
          {closed && can('rounds', 'reopen') && <Button variant="secondary" onClick={() => { set({ reason: '' }); setDlg('reopen'); }}>Reopen...</Button>}
        </div>
      </div>

      {/* ── Partner settlement ────────────────────────────────────────── */}
      {(
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Partner settlement</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {st && <Button variant="secondary" onClick={sheet}>Excel sheet</Button>}
              {!closed && can('partners', 'manage') && <Button variant="secondary" loading={calc.isPending} onClick={() => calc.mutate()}>{st ? 'Recalculate' : 'Calculate'}</Button>}
            </div>
          </div>
          {!closed && (
            <div className="grid grid-cols-3 gap-3 mb-3" style={{ maxWidth: 560 }}>
              <div><label className={LABEL}>Basis</label><select className={INPUT} value={f.mode} onChange={e => set({ mode: e.target.value })}><option>Accrual</option><option>Cash</option></select></div>
              <div><label className={LABEL}>Carry forward ({CUR})</label><input className={INPUT} value={f.carry} onChange={e => set({ carry: e.target.value })} placeholder="0" disabled={!can('rounds', 'carryForward')} /></div>
            </div>
          )}
          {!st ? <p className="text-sm text-gray-400">Not calculated yet.</p> : (
            <>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
                <span>Revenue <b>{formatMoney(st.revenueMinor, CUR)}</b></span>
                <span>Expenses <b>{formatMoney(st.expenseMinor, CUR)}</b></span>
                <span>Profit <b>{formatMoney(st.profitMinor, CUR)}</b> ({st.mode})</span>
                {st.carryForwardMinor > 0 && <span>Held in reserve <b>{formatMoney(st.carryForwardMinor, CUR)}</b></span>}
                <span>Status <b>{st.status}</b></span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr className="table-header"><th>Partner</th><th>Share</th><th style={{ textAlign: 'right' }}>Profit share</th><th style={{ textAlign: 'right' }}>Paid directly</th><th style={{ textAlign: 'right' }}>Collected directly</th><th style={{ textAlign: 'right' }}>Result</th></tr></thead>
                <tbody>
                  {st.partners.map(p => (
                    <tr key={String(p.partnerId)} className="table-row">
                      <td>{p.partner?.name}</td><td>{(p.shareBp / 100).toFixed(2)}%</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(p.shareMinor, CUR)}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(p.paidDirectMinor, CUR)}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(p.collectedDirectMinor, CUR)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: p.netMinor < 0 ? '#991B1B' : '#065F46' }}>{p.netMinor < 0 ? 'Pays ' : p.netMinor > 0 ? 'Receives ' : ''}{formatMoney(Math.abs(p.netMinor), CUR)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {st.transfers.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p className={LABEL}>Suggested transfers</p>
                  {st.transfers.map(t => (
                    <div key={t._id} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
                      <span>{t.from?.name} pays {t.to?.name}</span><b>{formatMoney(t.amountMinor, CUR)}</b>
                      <span className="badge" style={{ background: t.status === 'Paid' ? '#D1FAE5' : '#F3F4F6' }}>{t.status}</span>
                      {st.status === 'Final' && t.status === 'Suggested' && can('partners', 'manage') && <button className="text-xs text-teal-600" onClick={() => pay.mutate(t._id)}>Mark paid</button>}
                      {t.status === 'Paid' && can('partners', 'manage') && <button className="text-xs text-red-500" onClick={() => { set({ reason: '' }); setDlg({ unpay: t }); }}>Reverse</button>}
                    </div>
                  ))}
                  {st.heldMinor?.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>The reserve cash ({formatMoney(st.heldMinor.reduce((a, h) => a + h.heldMinor, 0), CUR)}) stays with the partner(s) who hold it.</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Reserve ───────────────────────────────────────────────────── */}
      {reserve && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>JV reserve (this vessel)</h3>
          <p style={{ fontSize: 13 }}>Balance: <b>{formatMoney(reserve.balances.USD, CUR)}</b></p>
          {reserve.movements.slice(0, 5).map(m => (
            <p key={m._id} style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.type} {formatMoney(m.amountMinor, m.currency)} - {m.roundId?.roundNumber} {m.status === 'Reversed' ? '(reversed)' : ''}</p>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>To fund an expense from the reserve, use the reserve action on that expense&apos;s Round (reserve.use permission).</p>
        </div>
      )}

      <Modal open={dlg === 'close'} onClose={() => setDlg(null)} title="Close Round"
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={close.isPending} disabled={hasPdaBlocker && (!canOverride || !f.override)} onClick={() => close.mutate()}>Close Round</Button></>}>
        <div className="flex flex-col gap-3">
          <p style={{ fontSize: 12 }}>Closing locks the Round, shares the profit between the vessel&apos;s partners and posts the closing entry.{carryMinor > 0 ? ` ${formatMoney(carryMinor, CUR)} will be held back as JV reserve.` : ''}</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Basis</label><select className={INPUT} value={f.mode} onChange={e => set({ mode: e.target.value })}><option>Accrual</option><option>Cash</option></select></div>
            <div><label className={LABEL}>Carry forward ({CUR})</label><input className={INPUT} value={f.carry} onChange={e => set({ carry: e.target.value })} disabled={!can('rounds', 'carryForward')} /></div>
          </div>
          {hasPdaBlocker && (
            <div>
              <label className={LABEL}>Open estimates (PDA) - override reason {canOverride ? <span className="text-red-400">*</span> : ''}</label>
              <textarea rows={2} className={INPUT} value={f.override} onChange={e => set({ override: e.target.value })} disabled={!canOverride} placeholder={canOverride ? 'Written reason (logged)' : 'You need the close-override permission'} />
            </div>
          )}
        </div>
      </Modal>
      <Modal open={dlg === 'reopen'} onClose={() => setDlg(null)} title="Reopen Round"
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Cancel</Button><Button loading={reopen.isPending} disabled={!f.reason} onClick={() => reopen.mutate()}>Reopen</Button></>}>
        <p style={{ fontSize: 12, marginBottom: 8 }}>Reverses the closing entry and the reserve held. Paid partner transfers must be reversed first.</p>
        <textarea rows={2} className={INPUT} value={f.reason} onChange={e => set({ reason: e.target.value })} placeholder="Reason (required)" />
      </Modal>
      <Modal open={!!dlg?.unpay} onClose={() => setDlg(null)} title="Reverse transfer payment"
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Keep</Button><Button loading={unpay.isPending} disabled={!f.reason} onClick={() => unpay.mutate()}>Reverse</Button></>}>
        <textarea rows={2} className={INPUT} value={f.reason} onChange={e => set({ reason: e.target.value })} placeholder="Reason (required)" />
      </Modal>
    </div>
  );
}
