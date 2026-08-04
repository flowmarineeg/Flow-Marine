'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { expensesService }    from '@/services/expenses.service';
import { expenseTypesService } from '@/services/expenseTypes.service';
import { usePermission }       from '@/context/PermissionContext';
import PageHeader    from '@/components/ui/PageHeader';
import Button        from '@/components/ui/Button';
import SearchBar     from '@/components/ui/SearchBar';
import Pagination    from '@/components/ui/Pagination';
import EmptyState    from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

import ExportButton from '@/components/ui/ExportButton';

const API_BASE  = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';
const fmt       = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney  = (n, c) => n != null ? `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${c || ''}` : '—';


export default function ExpenseList() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const { can } = usePermission();

  const [page,         setPage]         = useState(1);
  const [expenseTypeId,setExpenseTypeId]= useState('');
  const [currency,     setCurrency]     = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selected,     setSelected]     = useState([]); // Sprint 047
  const [bulkConfirm,  setBulkConfirm]  = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', page, expenseTypeId, currency, dateFrom, dateTo],
    queryFn:  () => expensesService.list({ page, limit: 20, expenseTypeId, currency, dateFrom, dateTo }).then(r => r.data),
  });

  const { data: etData } = useQuery({
    queryKey: ['expense-types-dd'],
    queryFn:  () => expenseTypesService.list({ limit: 200 }).then(r => r.data.data),
  });
  const expenseTypes = etData || [];

  const deleteMutation = useMutation({
    mutationFn: (id) => expensesService.remove(id),
    onSuccess: () => {
      toast.success('Expense deleted');
      qc.invalidateQueries(['expenses']);
      setDeleteTarget(null);
    },
    onError: (e) => showErrorToast(e, 'delete'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      const failed = [];
      let deletedCount = 0;
      for (const id of ids) {
        try {
          await expensesService.remove(id);
          deletedCount++;
        } catch (e) {
          failed.push({ id, reason: e?.response?.data?.message || e?.message || 'Delete failed' });
        }
      }
      return { deletedCount, failed };
    },
    onSuccess: ({ deletedCount, failed }) => {
      qc.invalidateQueries(['expenses']);
      setSelected([]);
      setBulkConfirm(false);
      if (failed.length === 0) {
        toast.success(`${deletedCount} expense${deletedCount !== 1 ? 's' : ''} deleted`);
      } else {
        toast.error(
          <div>
            <p className="font-semibold text-[13px]">{deletedCount} deleted, {failed.length} failed</p>
            <ul className="mt-1 text-[11px] list-disc list-inside space-y-0.5">
              {failed.map((f, i) => <li key={i}>{f.reason}</li>)}
            </ul>
          </div>
        );
      }
    },
  });

  const expenses   = data?.data || [];
  const pagination = data?.pagination;
  const toggleSelect = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll    = ()   => setSelected(p => p.length === expenses.length ? [] : expenses.map(e => e._id));
  const sc = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Expenses"
        subtitle="Track round and voyage expenses"
        action={can('expenses', 'create') && (
          <Button onClick={() => router.push('/expenses/new')}>+ New Expense</Button>
        )}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select value={expenseTypeId} onChange={e => { setExpenseTypeId(e.target.value); setPage(1); }} className={sc}>
          <option value="">All Types</option>
          {expenseTypes.map(et => <option key={et._id} value={et._id}>{et.name}</option>)}
        </select>
        <input
          value={currency} onChange={e => { setCurrency(e.target.value.toUpperCase()); setPage(1); }}
          placeholder="Currency (USD…)"
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white w-32 focus:outline-none focus:border-teal-500"
        />
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
        <span className="text-gray-400 text-xs">to</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
        <ExportButton module="expenses" filters={{ expenseTypeId, currency, dateFrom, dateTo }} selectedIds={[]} onClear={() => {}} />
        {/* Sprint 047 — bulk delete */}
        {selected.length > 0 && can('expenses', 'delete') && (
          <Button variant="danger" size="sm" onClick={() => setBulkConfirm(true)}>
            Delete Selected ({selected.length})
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner fullPage /> : expenses.length === 0 ? (
          <EmptyState title="No expenses found" message="Create an expense linked to a round or voyage." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="table-header">
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" checked={selected.length === expenses.length && expenses.length > 0} onChange={toggleAll} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
                  </th>
                  {['Date', 'Type', 'Category', 'Scope', 'Round / Voyage', 'Agent', 'Amount', 'Port', 'File', 'Actions'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp._id} className="table-row">
                    <td className="px-4">
                      <input type="checkbox" checked={selected.includes(exp._id)} onChange={() => toggleSelect(exp._id)} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
                    </td>
                    <td className="text-xs text-gray-600">{fmt(exp.expenseDate)}</td>
                    <td>
                      <span className="text-sm font-medium text-gray-700">{exp.expenseTypeId?.name}</span>
                    </td>
                    <td>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {exp.expenseTypeId?.category}
                      </span>
                    </td>
                    <td>
                      {/* Sprint 036 — scope is computed server-side (deriveScope), never re-derived here */}
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        exp.scope === 'Port'   ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : exp.scope === 'Voyage' ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-teal-50 text-teal-700 border border-teal-200'
                      }`}>
                        {exp.scope || '—'}
                      </span>
                    </td>
                    <td>
                      {exp.roundId  && <div><span className="mono text-xs text-teal-600 font-semibold">{exp.roundId.roundNumber}</span><p className="text-[11px] text-gray-400">{exp.roundId.roundName || '(unnamed)'}</p></div>}
                      {exp.voyageId && <div><span className="mono text-xs text-purple-600 font-semibold">{exp.voyageId.voyageNumber}</span><p className="text-[11px] text-gray-400">{exp.voyageId.voyageName || '(unnamed)'}</p></div>}
                    </td>
                    <td className="text-xs text-gray-500">{exp.agentId?.agentName || '—'}</td>
                    <td>
                      <span className="mono text-xs font-semibold text-gray-700">{fmtMoney(exp.amount, exp.currency)}</span>
                    </td>
                    <td className="text-xs text-gray-500">{exp.portId?.name || exp.port || '—'}</td>
                    <td>
                      {exp.attachmentUrl ? (
                        <a
                          href={`${API_BASE}${exp.attachmentUrl}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800 transition"
                          title={exp.attachmentOriginalName}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                          </svg>
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        {can('expenses', 'update') && (
                          <button onClick={() => router.push(`/expenses/${exp._id}`)}
                            className="text-xs font-medium text-teal-600 hover:text-teal-800 transition">Edit</button>
                        )}
                        {can('expenses', 'delete') && (
                          <button onClick={() => setDeleteTarget(exp)}
                            className="text-xs font-medium text-red-400 hover:text-red-600 transition">Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            {pagination.total} expense{pagination.total !== 1 ? 's' : ''} total
            {selected.length > 0 && <span className="text-teal-600 font-medium"> · {selected.length} selected</span>}
          </p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
        title="Delete Expense"
        message="Delete this expense? Any attached file will also be removed from the server. This cannot be undone."
      />

      <ConfirmDialog
        open={bulkConfirm}
        onClose={() => setBulkConfirm(false)}
        onConfirm={() => bulkDeleteMutation.mutate(selected)}
        loading={bulkDeleteMutation.isPending}
        title="Delete Selected Expenses"
        message={`Delete ${selected.length} selected expense${selected.length !== 1 ? 's' : ''}? Any attached files will also be removed from the server. This is permanent. Any expense that can't be deleted will be reported and skipped.`}
        confirmLabel="Delete Selected"
      />
    </div>
  );
}
