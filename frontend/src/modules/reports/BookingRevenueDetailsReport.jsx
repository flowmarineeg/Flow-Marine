'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsService } from '@/services/reports.service';
import { agentsService }  from '@/services/agents.service';
import { useRounds } from '@/hooks/useRounds';
import { voyagesService } from '@/services/voyages.service';
import ReportLayout from './ReportLayout';
import { ReportStatCard, ReportEmptyState, rsc, fmtMoney, fmtNum } from './reportHelpers';

// Sprint 034 Task 2 — Booking Revenue Details.
// Layer 2, Final Loading ONLY. Each row is one commercial PRICING GROUP —
// Agent + Commodity + POL + POD + Container Type + Freight Rate — never
// merged with a different pricing group. Rate 20/Rate 40 are always the
// real Freight Rate shared by every booking in that group, never an
// average (sprints/034-sprint.txt Decision 9).

export default function BookingRevenueDetailsReport() {
  const [agentId,  setAgentId]  = useState('');
  const [roundId,  setRoundId]  = useState('');
  const [voyageId, setVoyageId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [hasRun,   setHasRun]   = useState(false);

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
  const voyages = voyageData || [];

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report-booking-revenue-details'],
    queryFn:  () => reportsService.getBookingRevenueDetails({ agentId, roundId, voyageId, dateFrom, dateTo }).then(r => r.data.data),
    enabled:  false,
  });

  const handleRun = () => { setHasRun(true); refetch(); };

  const rows       = data?.rows       || [];
  const grandTotal = data?.grandTotal || {};
  const isRunning  = isLoading || isFetching;

  return (
    <ReportLayout
      title="Booking Revenue Details"
      subtitle="Final Loading bookings grouped by commercial pricing group"
      filters={
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Agent</p>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} className={rsc}>
              <option value="">All Agents</option>
              {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode} — {a.agentName}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Round</p>
            <select value={roundId} onChange={e => { setRoundId(e.target.value); setVoyageId(''); }} className={rsc}>
              <option value="">All Rounds</option>
              {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Voyage</p>
            <select value={voyageId} onChange={e => setVoyageId(e.target.value)} disabled={!roundId} className={`${rsc} disabled:opacity-50`}>
              <option value="">All Voyages</option>
              {voyages.map(v => <option key={v._id} value={v._id}>{v.voyageNumber} ({v.voyageName || 'unnamed'})</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">From</p>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">To</p>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>
          <button onClick={handleRun} disabled={isRunning} className="btn btn-primary btn-md flex items-center gap-1.5">
            {isRunning ? (
              <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>Running…</>
            ) : 'Run Report'}
          </button>
        </div>
      }
      summary={rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ReportStatCard label="Pricing Groups" value={fmtNum(rows.length)} />
          <ReportStatCard label="Total TEUs"     value={fmtNum(grandTotal.teus)} />
          <ReportStatCard label="Total VGM"      value={fmtNum(grandTotal.vgm)} sub="MT" />
          <ReportStatCard label="Total Revenue"  value={fmtMoney(grandTotal.totalRevenue)} accent />
        </div>
      )}
    >
      {!hasRun ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M3 3v18h18M7 15l4-4 3 3 5-6"/>
          </svg>
          <p className="text-sm">Set filters and click &quot;Run Report&quot;</p>
        </div>
      ) : rows.length === 0 && !isRunning ? (
        <ReportEmptyState message="No Final Loading bookings match the selected filters." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="table-header">
                  {['Sr', 'Agent', 'Commodity', 'POL', 'POD', '20 Qty', '40 Qty', 'TEUs', 'VGM (MT)', 'Rate 20', 'Rate 40', 'Revenue 20', 'Revenue 40', 'Total Revenue (USD)'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={`${r.agentId}-${r.commodity}-${r.polName}-${r.podName}-${r.containerTypeId}-${r.rate20 || r.rate40}-${idx}`} className="table-row">
                    <td className="text-xs text-gray-400">{idx + 1}</td>
                    <td className="text-xs text-gray-700 max-w-[140px] truncate">{r.agentName || '—'}</td>
                    <td className="text-xs text-gray-600 max-w-[140px] truncate">{r.commodity}</td>
                    <td className="text-xs text-gray-500">{r.polName || '—'}</td>
                    <td className="text-xs text-gray-500">{r.podName || '—'}</td>
                    <td className="text-xs text-gray-600">{r.qty20 > 0 ? fmtNum(r.qty20) : '—'}</td>
                    <td className="text-xs text-gray-600">{r.qty40 > 0 ? fmtNum(r.qty40) : '—'}</td>
                    <td className="text-xs text-gray-600">{fmtNum(r.teus)}</td>
                    <td className="text-xs text-gray-600">{fmtNum(r.vgm)}</td>
                    <td className="text-xs text-gray-600">{r.qty20 > 0 ? fmtMoney(r.rate20) : '—'}</td>
                    <td className="text-xs text-gray-600">{r.qty40 > 0 ? fmtMoney(r.rate40) : '—'}</td>
                    <td className="text-xs text-gray-600">{r.qty20 > 0 ? fmtMoney(r.revenue20) : '—'}</td>
                    <td className="text-xs text-gray-600">{r.qty40 > 0 ? fmtMoney(r.revenue40) : '—'}</td>
                    <td><span className="mono text-xs font-bold text-teal-700">{fmtMoney(r.totalRevenue)}</span></td>
                  </tr>
                ))}
                <tr className="bg-teal-50 font-semibold border-t-2 border-teal-200">
                  <td colSpan={5} className="px-4 py-2.5 text-xs font-bold text-gray-700">GRAND TOTAL</td>
                  <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(grandTotal.qty20)}</td>
                  <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(grandTotal.qty40)}</td>
                  <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(grandTotal.teus)}</td>
                  <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(grandTotal.vgm)}</td>
                  <td colSpan={2} className="px-4 py-2.5 text-xs text-gray-400">—</td>
                  <td className="px-4 py-2.5 mono text-xs font-bold">{fmtMoney(grandTotal.revenue20)}</td>
                  <td className="px-4 py-2.5 mono text-xs font-bold">{fmtMoney(grandTotal.revenue40)}</td>
                  <td className="px-4 py-2.5 mono text-xs font-bold text-teal-700">{fmtMoney(grandTotal.totalRevenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ReportLayout>
  );
}
