'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsService }    from '@/services/reports.service';
import { expenseTypesService } from '@/services/expenseTypes.service';
import { roundsService }     from '@/services/rounds.service';
import { voyagesService }    from '@/services/voyages.service';
import { EXPENSE_CATEGORIES } from '@/utils/constants';
import ReportLayout   from './ReportLayout';
import { ReportStatCard, ReportEmptyState, rsc, fmtNum } from './reportHelpers';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getVoyageLabel } from '@/utils/voyageLabel';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const fmtAmt = (n, c) => `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${c}`;

export default function ExpenseReport() {
  const [filters, setFilters] = useState({ category: '', expenseTypeId: '', roundId: '', voyageId: '', portId: '', dateFrom: '', dateTo: '', currency: '' });
  const [run, setRun] = useState(false);

  const { data: etData }  = useQuery({ queryKey: ['expense-types-dd'],  queryFn: () => expenseTypesService.list({ limit: 200 }).then(r => r.data.data) });
  const { data: rdData }  = useQuery({ queryKey: ['rounds-dd'],         queryFn: () => roundsService.list({ limit: 200 }).then(r => r.data.data) });
  // Sprint 038 — Voyage dropdown cascades from Round so its own
  // populated polId/podId can build the Port dropdown client-side, same
  // convention ExpenseForm.jsx's Sprint 036 Port selector already uses.
  const { data: vgData }  = useQuery({
    queryKey: ['voyages-dd', filters.roundId],
    queryFn:  () => voyagesService.list({ roundId: filters.roundId, limit: 200 }).then(r => r.data.data),
    enabled:  !!filters.roundId,
  });
  const expenseTypes = etData || [];
  const rounds       = rdData || [];
  const voyages      = vgData || [];
  const selectedVoyage = voyages.find(v => v._id === filters.voyageId);
  const voyagePortOptions = selectedVoyage
    ? [selectedVoyage.polId, selectedVoyage.podId].filter(Boolean)
    : [];

  const { data, isLoading } = useQuery({
    queryKey: ['report-expenses', filters],
    queryFn:  () => reportsService.getExpenseReport(filters).then(r => r.data.data),
    enabled:  run,
  });

  const rows                 = data?.rows                 || [];
  const summary               = data?.summary               || [];
  const classificationSummary = data?.classificationSummary || [];
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  // Grand total per currency
  const totals = {};
  rows.forEach(e => { totals[e.currency] = (totals[e.currency] || 0) + e.amount; });

  return (
    <ReportLayout
      title="Expense Report"
      subtitle="All operational expenses filtered by category, type, round or voyage"
      filters={
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Category</p>
            <select value={filters.category} onChange={e => set('category', e.target.value)} className={rsc}>
              <option value="">All Categories</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Expense Type</p>
            <select value={filters.expenseTypeId} onChange={e => set('expenseTypeId', e.target.value)} className={rsc}>
              <option value="">All Types</option>
              {expenseTypes.map(et => <option key={et._id} value={et._id}>{et.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Round</p>
            <select
              value={filters.roundId}
              onChange={e => { set('roundId', e.target.value); set('voyageId', ''); set('portId', ''); }}
              className={rsc}
            >
              <option value="">All Rounds</option>
              {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Voyage</p>
            <select
              value={filters.voyageId}
              onChange={e => { set('voyageId', e.target.value); set('portId', ''); }}
              disabled={!filters.roundId}
              className={`${rsc} disabled:opacity-50`}
            >
              <option value="">All Voyages</option>
              {voyages.map(v => <option key={v._id} value={v._id}>{getVoyageLabel(v)}</option>)}
            </select>
          </div>
          {/* Sprint 038 — Port filter, cascading from Voyage; options are
              exactly the selected voyage's own POL/POD, same current
              schema limitation ExpenseForm.jsx's Sprint 036 Port
              selector already documents. */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Port</p>
            <select
              value={filters.portId}
              onChange={e => set('portId', e.target.value)}
              disabled={!filters.voyageId}
              className={`${rsc} disabled:opacity-50`}
            >
              <option value="">All Ports</option>
              {voyagePortOptions.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Currency</p>
            <input value={filters.currency} onChange={e => set('currency', e.target.value.toUpperCase())}
              placeholder="USD" className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white w-24 focus:outline-none focus:border-teal-500 uppercase" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">From</p>
            <input type="date" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">To</p>
            <input type="date" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>
          <button onClick={() => setRun(true)} className="btn btn-primary btn-md">Run Report</button>
        </div>
      }
      summary={rows.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <ReportStatCard label="Expenses" value={fmtNum(rows.length)} />
          {Object.entries(totals).map(([cur, amt]) => (
            <ReportStatCard key={cur} label={`Total (${cur})`}
              value={`${Number(amt).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${cur}`} accent />
          ))}
        </div>
      )}
    >
      {isLoading ? <LoadingSpinner fullPage /> :
       !run ? (
        <div className="card flex items-center justify-center py-16 text-gray-400">
          <p className="text-sm">Set filters and click &quot;Run Report&quot;.</p>
        </div>
       ) : rows.length === 0 ? <ReportEmptyState /> : (
        <div className="flex flex-col gap-4">
          {/* Category summary */}
          {summary.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500">Summary by Category</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="table-header">
                      {['Category','Currency','Total','Count'].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((s, i) => (
                      <tr key={i} className="table-row">
                        <td><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.category}</span></td>
                        <td className="mono text-xs font-semibold text-gray-500">{s.currency}</td>
                        <td><span className="mono text-xs font-bold text-red-600">{fmtAmt(s.total, s.currency)}</span></td>
                        <td className="text-xs text-gray-500">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sprint 038 — Summary by Classification (Voyage Cost / Other
              Voyage Cost), grouped via the exact same
              ExpenseCategory.costClassification map getRoundPnL already
              uses — these totals reconcile exactly with Voyage
              Profitability's for the same round. */}
          {classificationSummary.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500">Summary by Classification</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Reconciles with Voyage Profitability&apos;s Voyage Cost / Other Voyage Cost totals</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="table-header">
                      {['Classification','Currency','Total','Count'].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {classificationSummary.map((s, i) => (
                      <tr key={i} className="table-row">
                        <td>
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            s.classification === 'Voyage Cost'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-50 text-slate-600 border border-slate-200'
                          }`}>
                            {s.classification}
                          </span>
                        </td>
                        <td className="mono text-xs font-semibold text-gray-500">{s.currency}</td>
                        <td><span className="mono text-xs font-bold text-red-600">{fmtAmt(s.total, s.currency)}</span></td>
                        <td className="text-xs text-gray-500">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detail table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500">All Expense Lines ({rows.length})</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="table-header">
                    {['Date','Type','Category','Scope','Round / Voyage','Agent','Amount','Currency','Port'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(e => (
                    <tr key={e._id} className="table-row">
                      <td className="text-xs text-gray-500">{fmt(e.expenseDate)}</td>
                      <td className="text-sm text-gray-700">{e.expenseTypeId?.name}</td>
                      <td><span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{e.expenseTypeId?.category}</span></td>
                      <td>
                        {/* Sprint 038 — scope is computed server-side (deriveScope), never re-derived here */}
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                          e.scope === 'Port'   ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : e.scope === 'Voyage' ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-teal-50 text-teal-700 border border-teal-200'
                        }`}>
                          {e.scope || '—'}
                        </span>
                      </td>
                      <td>
                        {e.roundId  && <div><span className="mono text-xs text-teal-600 font-semibold">{e.roundId.roundNumber}</span><p className="text-[11px] text-gray-400">{e.roundId.roundName || '(unnamed)'}</p></div>}
                        {e.voyageId && <div><span className="mono text-xs text-purple-600 font-semibold">{getVoyageLabel(e.voyageId)}</span></div>}
                      </td>
                      <td className="text-xs text-gray-500">{e.agentId?.agentName || '—'}</td>
                      <td><span className="mono text-xs font-semibold text-gray-700">{Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></td>
                      <td className="mono text-xs text-gray-400">{e.currency}</td>
                      <td className="text-xs text-gray-400">{e.portId?.name || e.port || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </ReportLayout>
  );
}
