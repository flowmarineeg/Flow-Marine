'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { expensesV2Service } from '@/services/agentAccounts.service';
import { usePermission } from '@/context/PermissionContext';
import { toMinor, fromMinor, formatMoney } from '@/utils/money';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

const INPUT = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition';

// Sprint 052 - per-row V2 actions on the Expenses list: PDA -> FDA, post, reverse.
export function ExpenseKindBadge({ exp }) {
  const isPda = exp.kind === 'PDA';
  return (
    <span className="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
      style={{ background: isPda ? '#FEF3C7' : exp.ledgerEntryId ? '#D1FAE5' : '#F3F4F6', color: isPda ? '#92400E' : exp.ledgerEntryId ? '#065F46' : '#4B5563' }}>
      {isPda ? 'PDA' : exp.ledgerEntryId ? 'FDA posted' : 'FDA'}
    </span>
  );
}

export default function ExpenseV2Actions({ exp }) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [dlg, setDlg] = useState(null); // 'convert' | 'reverse'
  const [val, setVal] = useState('');

  const done = (msg) => () => { toast.success(msg); setDlg(null); setVal(''); qc.invalidateQueries({ queryKey: ['expenses'] }); };
  const convert = useMutation({
    mutationFn: () => expensesV2Service.convertToFda(exp._id, { amount: Number(val) }),
    onSuccess: (r) => {
      const v = r.data.data.varianceMinor;
      toast.success(v === null ? 'Final expense created' : `Final created. Variance vs estimate: ${formatMoney(v, exp.currency)}`);
      setDlg(null); setVal(''); qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: e => showErrorToast(e, 'save'),
  });
  const post = useMutation({ mutationFn: () => expensesV2Service.post(exp._id), onSuccess: done('Expense posted to the ledger'), onError: e => showErrorToast(e, 'update') });
  const reverse = useMutation({ mutationFn: () => expensesV2Service.reverse(exp._id, val), onSuccess: done('Expense reversed'), onError: e => showErrorToast(e, 'update') });

  if (!can('expenses', 'approve')) return null;

  return (
    <>
      {exp.kind === 'PDA' && <button onClick={() => { setVal(String(exp.amount)); setDlg('convert'); }} className="text-xs font-medium text-amber-600 hover:text-amber-800 transition">To FDA</button>}
      {exp.kind !== 'PDA' && !exp.ledgerEntryId && exp.paidBy && <button onClick={() => post.mutate()} disabled={post.isPending} className="text-xs font-medium text-emerald-600 hover:text-emerald-800 transition">Post</button>}
      {exp.ledgerEntryId && <button onClick={() => { setVal(''); setDlg('reverse'); }} className="text-xs font-medium text-purple-600 hover:text-purple-800 transition">Reverse</button>}

      <Modal open={dlg === 'convert'} onClose={() => setDlg(null)} title="Convert estimate to final (FDA)"
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Close</Button><Button disabled={!(Number(val) >= 0) || val === ''} loading={convert.isPending} onClick={() => convert.mutate()}>Create final</Button></>}>
        <p style={{ fontSize: 12, marginBottom: 8 }}>Estimate: {formatMoney(toMinor(exp.amount, exp.currency), exp.currency)}. Enter the actual amount ({exp.currency}); the difference is shown after saving. Each estimate can have one final.</p>
        <input className={INPUT} value={val} onChange={e => setVal(e.target.value)} placeholder={fromMinor(toMinor(exp.amount, exp.currency), exp.currency)} />
      </Modal>
      <Modal open={dlg === 'reverse'} onClose={() => setDlg(null)} title="Reverse posted expense"
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>Keep</Button><Button disabled={!val} loading={reverse.isPending} onClick={() => reverse.mutate()}>Reverse</Button></>}>
        <p style={{ fontSize: 12, marginBottom: 8 }}>Posts a reversing entry; the expense becomes editable again.</p>
        <textarea rows={2} className={INPUT} value={val} onChange={e => setVal(e.target.value)} placeholder="Reason (required)" />
      </Modal>
    </>
  );
}
