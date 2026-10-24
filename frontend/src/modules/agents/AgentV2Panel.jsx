'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { agentAccountsService } from '@/services/agentAccounts.service';
import { agentsService } from '@/services/agents.service';
import { useRounds } from '@/hooks/useRounds';
import { usePermission } from '@/context/PermissionContext';
import { toMinor, fromMinor, formatMoney } from '@/utils/money';
import Button from '@/components/ui/Button';

const LABEL = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const INPUT = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition';
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '-');
const KIND_LABEL = { Invoice: 'Invoices', Advance: 'Advances', Receipts: 'Receipts', Cost: 'Port costs', Handling: 'Handling fees', Commission: 'Commission', PaidOrOffset: 'Paid / offset' };

// ─── SOA ──────────────────────────────────────────────────────────────────────
function SoaTab({ agentId, currency }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-soa', agentId, currency],
    queryFn: () => agentAccountsService.soa(agentId, { currency }).then(r => r.data.data),
  });
  if (isLoading) return <p className="text-sm text-gray-400">Loading...</p>;
  const dir = data.direction === 'AgentOwesUs' ? 'Agent owes us' : data.direction === 'WeOweAgent' ? 'We owe the agent' : 'Even';
  return (
    <div className="flex flex-col gap-4">
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <div><div className={LABEL}>Closing position</div><div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(Math.abs(data.closingMinor), currency)}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dir}</div></div>
        {Object.entries(data.ageing).map(([k, v]) => (
          <div key={k}><div className={LABEL}>{k} days</div><div style={{ fontSize: 14, fontWeight: 600 }}>{formatMoney(v, currency)}</div></div>
        ))}
      </div>
      {data.rows.length === 0 ? <p className="text-sm text-gray-400">No ledger activity for this agent yet.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr className="table-header"><th>Date</th><th>Entry</th><th>Memo</th><th style={{ textAlign: 'right' }}>Change</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i} className="table-row">
                <td>{fmtDate(r.date)}</td><td className="mono text-xs">{r.entryNumber}</td><td className="text-xs">{r.memo}</td>
                <td style={{ textAlign: 'right', color: r.deltaMinor < 0 ? '#991B1B' : '#065F46' }}>{formatMoney(r.deltaMinor, currency)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(r.balanceMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Positive = the agent owes us (invoices, advances). Negative = we owe the agent (port costs, handling, commission).</p>
    </div>
  );
}

// ─── Agreements ───────────────────────────────────────────────────────────────
const emptyAgreement = () => ({ validFrom: new Date().toISOString().slice(0, 10), validTo: '', currency: 'USD', status: 'Active', fees: { 'Load|Full': '', 'Load|Empty': '', 'Discharge|Full': '', 'Discharge|Empty': '' }, rule: '', amount: '', percent: '' });

function AgreementsTab({ agentId }) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [form, setForm] = useState(null);
  const set = (p) => setForm(f => ({ ...f, ...p }));
  const { data = [] } = useQuery({ queryKey: ['agent-agreements', agentId], queryFn: () => agentAccountsService.listAgreements(agentId).then(r => r.data.data) });

  const save = useMutation({
    mutationFn: () => {
      const cur = form.currency;
      const handlingFees = Object.entries(form.fees).filter(([, v]) => v !== '').map(([k, v]) => {
        const [moveType, containerStatus] = k.split('|');
        return { moveType, containerStatus, amountMinor: toMinor(v, cur) };
      });
      const commission = form.rule
        ? { rule: form.rule, amountMinor: form.rule === 'percentOfRate' ? 0 : toMinor(form.amount || '0', cur), percentBp: form.rule === 'percentOfRate' ? Math.round(Number(form.percent || 0) * 100) : 0 }
        : { rule: null };
      return agentAccountsService.saveAgreement(agentId, { validFrom: form.validFrom, validTo: form.validTo || null, currency: cur, status: form.status, handlingFees, commission }, form._id);
    },
    onSuccess: () => { toast.success('Agreement saved'); setForm(null); qc.invalidateQueries({ queryKey: ['agent-agreements', agentId] }); },
    onError: e => showErrorToast(e, 'save'),
  });
  const del = useMutation({
    mutationFn: (id) => agentAccountsService.deleteAgreement(agentId, id),
    onSuccess: () => { toast.success('Agreement deleted'); qc.invalidateQueries({ queryKey: ['agent-agreements', agentId] }); },
    onError: e => showErrorToast(e, 'delete'),
  });

  const edit = (a) => {
    const fees = emptyAgreement().fees;
    (a.handlingFees || []).forEach(f => { fees[`${f.moveType}|${f.containerStatus}`] = fromMinor(f.amountMinor, a.currency); });
    setForm({
      _id: a._id, validFrom: fmtDate(a.validFrom), validTo: a.validTo ? fmtDate(a.validTo) : '', currency: a.currency, status: a.status, fees,
      rule: a.commission?.rule || '', amount: a.commission?.rule && a.commission.rule !== 'percentOfRate' ? fromMinor(a.commission.amountMinor, a.currency) : '',
      percent: a.commission?.rule === 'percentOfRate' ? String((a.commission.percentBp || 0) / 100) : '',
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {!form && can('agents', 'update') && <div><Button onClick={() => setForm(emptyAgreement())}>+ New agreement</Button></div>}
      {form && (
        <div className="card" style={{ padding: 16 }}>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div><label className={LABEL}>Valid from</label><input type="date" className={INPUT} value={form.validFrom} onChange={e => set({ validFrom: e.target.value })} /></div>
            <div><label className={LABEL}>Valid to</label><input type="date" className={INPUT} value={form.validTo} onChange={e => set({ validTo: e.target.value })} /></div>
            <div><label className={LABEL}>Currency</label><input className={`${INPUT} uppercase`} maxLength={3} value={form.currency} onChange={e => set({ currency: e.target.value.toUpperCase() })} /></div>
            <div><label className={LABEL}>Status</label><select className={INPUT} value={form.status} onChange={e => set({ status: e.target.value })}><option>Active</option><option>Inactive</option></select></div>
          </div>
          <p className={LABEL}>Port handling fee per container</p>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {Object.keys(form.fees).map(k => (
              <div key={k}><label className={LABEL}>{k.replace('|', ' / ')}</label>
                <input className={INPUT} value={form.fees[k]} onChange={e => set({ fees: { ...form.fees, [k]: e.target.value } })} placeholder="-" /></div>
            ))}
          </div>
          <p className={LABEL}>Commission</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <select className={INPUT} value={form.rule} onChange={e => set({ rule: e.target.value })}>
              <option value="">No commission</option>
              <option value="fixedPerContainer">Fixed per container</option>
              <option value="fixedPerBooking">Fixed per booking</option>
              <option value="percentOfRate">Percent of invoice</option>
            </select>
            {form.rule && form.rule !== 'percentOfRate' && <input className={INPUT} placeholder={`Amount (${form.currency})`} value={form.amount} onChange={e => set({ amount: e.target.value })} />}
            {form.rule === 'percentOfRate' && <input className={INPUT} placeholder="Percent, e.g. 2.5" value={form.percent} onChange={e => set({ percent: e.target.value })} />}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>Save agreement</Button>
          </div>
        </div>
      )}
      {data.length === 0 && !form ? <p className="text-sm text-gray-400">No agreements yet.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr className="table-header"><th>Valid</th><th>Currency</th><th>Handling fees</th><th>Commission</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.map(a => (
              <tr key={a._id} className="table-row">
                <td>{fmtDate(a.validFrom)} to {a.validTo ? fmtDate(a.validTo) : 'open'}</td><td>{a.currency}</td>
                <td className="text-xs">{(a.handlingFees || []).map(f => `${f.moveType} ${f.containerStatus}: ${fromMinor(f.amountMinor, a.currency)}`).join(' | ') || '-'}</td>
                <td className="text-xs">{a.commission?.rule || '-'}</td><td>{a.status}</td>
                <td>{can('agents', 'update') && (<><button className="text-xs text-teal-600 mr-3" onClick={() => edit(a)}>Edit</button><button className="text-xs text-red-500" onClick={() => del.mutate(a._id)}>Delete</button></>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Commission (audit H7) ────────────────────────────────────────────────────
function CommissionTab({ agentId }) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const { data = [] } = useQuery({ queryKey: ['agent-commissions', agentId], queryFn: () => agentAccountsService.listCommissions(agentId).then(r => r.data.data) });
  const cancel = useMutation({
    mutationFn: () => agentAccountsService.cancelCommission(target._id, reason),
    onSuccess: () => { toast.success('Commission cancelled'); setTarget(null); setReason(''); qc.invalidateQueries({ queryKey: ['agent-commissions', agentId] }); qc.invalidateQueries({ queryKey: ['agent-soa', agentId] }); },
    onError: e => showErrorToast(e, 'update'),
  });
  return (
    <div className="flex flex-col gap-3">
      {data.length === 0 ? <p className="text-sm text-gray-400">No commission accrued for this agent.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr className="table-header"><th>Date</th><th>Invoice</th><th>Round</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.map(c => (
              <tr key={c._id} className="table-row" style={{ opacity: c.status === 'Cancelled' ? 0.5 : 1 }}>
                <td>{fmtDate(c.createdAt)}</td><td>{c.invoiceId?.invoiceNumber || '-'} {c.invoiceId?.status === 'Cancelled' && <span style={{ color: '#991B1B', fontSize: 11 }}>(invoice cancelled)</span>}</td>
                <td>{c.roundId?.roundNumber || '-'}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(c.amountMinor, c.currency)}</td><td>{c.status}</td>
                <td>{c.status === 'Accrued' && can('agents', 'commission') && <button className="text-xs text-red-500" onClick={() => { setReason(''); setTarget(c); }}>Cancel</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {target && (
        <div className="card" style={{ padding: 12, maxWidth: 420 }}>
          <p style={{ fontSize: 12, marginBottom: 6 }}>Cancel {formatMoney(target.amountMinor, target.currency)} commission. This reverses the ledger entry.</p>
          <textarea rows={2} className={INPUT} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setTarget(null)}>Keep</Button>
            <Button disabled={!reason} loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel commission</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Round settlement: handling, netting, final statement ────────────────────
function SettlementTab({ agentId, currency }) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const { rounds } = useRounds();
  const [roundId, setRoundId] = useState('');
  const [preview, setPreview] = useState(null);
  const canOffset = can('agents', 'offset');

  const { data: statement } = useQuery({
    queryKey: ['agent-statement', agentId, roundId, currency],
    queryFn: () => agentAccountsService.getStatement(agentId, roundId, currency).then(r => r.data.data),
    enabled: !!roundId,
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['agent-statement', agentId] }); qc.invalidateQueries({ queryKey: ['agent-soa', agentId] }); };
  const ok = (msg) => () => { toast.success(msg); refresh(); };

  const doPreview = useMutation({ mutationFn: () => agentAccountsService.handlingPreview(agentId, roundId).then(r => r.data.data), onSuccess: setPreview, onError: e => showErrorToast(e, 'update') });
  const doConfirm = useMutation({ mutationFn: () => agentAccountsService.handlingConfirm(agentId, roundId), onSuccess: () => { toast.success('Handling charges posted'); setPreview(null); refresh(); }, onError: e => showErrorToast(e, 'save') });
  const build = useMutation({ mutationFn: () => agentAccountsService.buildStatement(agentId, { roundId, currency }), onSuccess: ok('Statement prepared'), onError: e => showErrorToast(e, 'save') });
  const agree = useMutation({ mutationFn: () => agentAccountsService.agreeStatement(statement._id), onSuccess: ok('Statement agreed'), onError: e => showErrorToast(e, 'update') });
  const settle = useMutation({ mutationFn: () => agentAccountsService.settleStatement(statement._id), onSuccess: ok('Statement settled'), onError: e => showErrorToast(e, 'update') });

  return (
    <div className="flex flex-col gap-4">
      <div style={{ maxWidth: 320 }}>
        <label className={LABEL}>Round</label>
        <select className={INPUT} value={roundId} onChange={e => { setRoundId(e.target.value); setPreview(null); }}>
          <option value="">Select round...</option>
          {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber}{r.roundName ? ` - ${r.roundName}` : ''}</option>)}
        </select>
      </div>

      {roundId && canOffset && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Handling charges</h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Built from this agent&apos;s Final Loading (load) and Discharged (discharge) bookings in the round, priced from their agreement. Generating twice never duplicates.</p>
          <Button variant="secondary" loading={doPreview.isPending} onClick={() => doPreview.mutate()}>Preview</Button>
          {preview && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              <div><b>{preview.charges.length}</b> new charges, total <b>{formatMoney(preview.totalMinor, preview.currency)}</b></div>
              {preview.unpriced.length > 0 && <div style={{ color: '#991B1B' }}>{preview.unpriced.length} move(s) have no fee in the agreement (or no full/empty status) and are skipped.</div>}
              {preview.charges.length > 0 && <div style={{ marginTop: 8 }}><Button loading={doConfirm.isPending} onClick={() => doConfirm.mutate()}>Confirm and post</Button></div>}
            </div>
          )}
        </div>
      )}

      {roundId && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Final settlement statement</h4>
          {canOffset && (!statement || statement.status === 'Draft') && (
            <div style={{ marginBottom: 10 }}><Button variant="secondary" loading={build.isPending} onClick={() => build.mutate()}>{statement ? 'Refresh from ledger' : 'Prepare statement'}</Button></div>
          )}
          {statement ? (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {statement.lines.map(l => (
                    <tr key={l.kind} className="table-row"><td>{KIND_LABEL[l.kind] || l.kind}</td><td style={{ textAlign: 'right' }}>{formatMoney(l.amountMinor, currency)}</td></tr>
                  ))}
                  <tr className="table-row"><td style={{ fontWeight: 700 }}>Net</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(statement.netMinor, currency)}</td></tr>
                </tbody>
              </table>
              <p style={{ fontSize: 13, marginTop: 8 }}>
                {statement.direction === 'AgentPaysUs' ? 'The agent pays us the net amount.' : statement.direction === 'WePayAgent' ? 'We pay the agent the net amount.' : 'Nothing to pay either way.'} Status: <b>{statement.status}</b>
              </p>
              {statement.status === 'Settled' && statement.residualMinor !== null && (
                <p style={{ fontSize: 13 }}>After offsetting, still to move in cash: <b>{formatMoney(Math.abs(statement.residualMinor), currency)}</b> ({statement.residualMinor > 0 ? 'agent pays us' : statement.residualMinor < 0 ? 'we pay the agent' : 'settled in full'}).</p>
              )}
              {canOffset && statement.status === 'Draft' && <Button onClick={() => agree.mutate()} loading={agree.isPending}>Mark agreed</Button>}
              {canOffset && statement.status === 'Agreed' && <Button onClick={() => settle.mutate()} loading={settle.isPending}>Settle (offset payables against invoices)</Button>}
            </>
          ) : <p className="text-sm text-gray-400">No statement for this round yet.</p>}
        </div>
      )}
    </div>
  );
}

// ─── Cash with the agent: advance, return, pay, net now ──────────────────────
function CashTab({ agentId, currency }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState('pay');
  const [f, setF] = useState({ amount: '', reference: '', batchId: '' });
  const set = (p) => setF(x => ({ ...x, ...p }));
  const done = (msg) => () => { toast.success(msg); setF({ amount: '', reference: '', batchId: '' }); qc.invalidateQueries({ queryKey: ['agent-soa', agentId] }); };
  const call = useMutation({
    mutationFn: () => {
      if (kind === 'offset') return agentAccountsService.offset(agentId, { batchId: f.batchId || `offset-${Date.now()}`, strategy: 'oldest', currency });
      const body = { amountMinor: toMinor(f.amount, currency), currency, reference: f.reference || undefined };
      return ({ pay: agentAccountsService.pay, advance: agentAccountsService.advance, return: agentAccountsService.returnAdvance })[kind](agentId, body);
    },
    onSuccess: (r) => { const d = r.data.data; if (kind === 'offset') toast.success(d.duplicate ? 'Batch already applied - nothing repeated' : d.applied ? `Offset ${formatMoney(d.appliedMinor, currency)}` : 'Nothing to offset'); else toast.success('Recorded'); done('')(); },
    onError: e => showErrorToast(e, 'save'),
  });
  return (
    <div className="card" style={{ padding: 16, maxWidth: 520 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['pay', 'Pay agent'], ['advance', 'Send advance'], ['return', 'Advance returned'], ['offset', 'Net payables vs invoices']].map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className="text-xs" style={{ padding: '4px 10px', borderRadius: 8, background: kind === k ? 'var(--teal)' : '#F3F4F6', color: kind === k ? '#fff' : '#374151' }}>{l}</button>
        ))}
      </div>
      {kind === 'offset' ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Uses what we owe this agent to settle their oldest open invoices. Safe to press twice: the same batch is never applied twice.</p>
      ) : (
        <div className="flex flex-col gap-3 mb-3">
          <div><label className={LABEL}>Amount ({currency})</label><input className={INPUT} value={f.amount} onChange={e => set({ amount: e.target.value })} /></div>
          <div><label className={LABEL}>Reference</label><input className={INPUT} value={f.reference} onChange={e => set({ reference: e.target.value })} /></div>
        </div>
      )}
      <Button loading={call.isPending} disabled={kind !== 'offset' && !(toMinor(f.amount, currency) > 0)} onClick={() => call.mutate()}>Confirm</Button>
    </div>
  );
}

// Sprint 052 E9 - agent accounting panel .
export default function AgentV2Panel({ agentId }) {
  const { can } = usePermission();
  const [tab, setTab] = useState('soa');
  const currency = 'USD';
  const { data: agent } = useQuery({ queryKey: ['agent', agentId], queryFn: () => agentsService.getById(agentId).then(r => r.data.data) });
  const isDirect = agent?.partyType === 'DirectLine';

  const tabs = [
    ['soa', 'Statement of Account'],
    ['agreements', 'Agreements'],
    ['commission', 'Commission'],
    !isDirect && ['settlement', 'Round Settlement'],
    !isDirect && can('agents', 'offset') && ['cash', 'Cash & Netting'],
  ].filter(Boolean);
  if (!tabs.length) return null;
  const active = tabs.find(t => t[0] === tab) ? tab : tabs[0][0];

  return (
    <div className="card" style={{ padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="text-sm font-medium" style={{ padding: '6px 12px', borderRadius: 8, background: active === k ? 'var(--teal)' : 'transparent', color: active === k ? '#fff' : '#4B5563' }}>{l}</button>
        ))}
      </div>
      {isDirect && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Direct Line: invoices and statement only - no offset or settlement document.</p>}
      {active === 'soa' && <SoaTab agentId={agentId} currency={currency} />}
      {active === 'agreements' && <AgreementsTab agentId={agentId} />}
      {active === 'commission' && <CommissionTab agentId={agentId} />}
      {active === 'settlement' && <SettlementTab agentId={agentId} currency={currency} />}
      {active === 'cash' && <CashTab agentId={agentId} currency={currency} />}
    </div>
  );
}
