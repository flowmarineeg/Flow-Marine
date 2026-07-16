'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Chart, registerables } from 'chart.js';
import { reportsService } from '@/services/reports.service';
import { roundsService }  from '@/services/rounds.service';
import ReportLayout       from './ReportLayout';
import { ReportStatCard, ReportEmptyState, rsc, fmtMoney, fmtNum } from './reportHelpers';

Chart.register(...registerables);

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── P&L Bar Chart ─────────────────────────────────────────────────────────────
function PnlChart({ expenseBreakdown = [], totalRevenue = 0 }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); }

    const labels  = ['Revenue', ...expenseBreakdown.map(e => e.category)];
    const values  = [totalRevenue, ...expenseBreakdown.map(e => e.total)];
    const colors  = ['#0D9488', ...expenseBreakdown.map(() => '#F87171')];

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Amount (USD)',
          data: values,
          backgroundColor: colors,
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` $${Number(ctx.raw).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => `$${(v / 1000).toFixed(0)}k`,
              font: { size: 11 },
            },
            grid: { color: '#F3F4F6' },
          },
          x: {
            ticks: { font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [expenseBreakdown, totalRevenue]);

  return <canvas ref={canvasRef} style={{ height: 240 }} />;
}

export default function RoundPnlReport() {
  const [roundId, setRoundId] = useState('');

  // ── Rounds dropdown ────────────────────────────────────────────────────────
  const { data: roundsData } = useQuery({
    queryKey: ['rounds-dd-populated'],
    queryFn:  () => roundsService.list({ limit: 200 }).then(r => r.data),
  });
  // Response shape: { data: { data: [...], pagination } }
  const rounds = roundsData?.data || [];

  // ── Report data ────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['report-round-pnl', roundId],
    queryFn:  () => reportsService.getRoundPnL({ roundId }).then(r => r.data.data),
    enabled:  !!roundId,
  });

  // ── Computed values ────────────────────────────────────────────────────────
  const totalExpenses = data ? Object.values(data.expenseTotals || {}).reduce((a, b) => a + b, 0) : 0;
  const netPnL        = (data?.totalRevenue ?? 0) - totalExpenses;
  const isRunning     = isLoading || isFetching;

  return (
    <ReportLayout
      title="Round P&L"
      subtitle="Revenue vs expenses for a single round"
      filters={
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Select Round</p>
            <select
              value={roundId}
              onChange={e => setRoundId(e.target.value)}
              className={rsc}
              style={{ minWidth: 240 }}
            >
              <option value="">Choose a round…</option>
              {rounds.map(r => (
                <option key={r._id} value={r._id}>
                  {r.roundNumber}
                  {r.serviceId?.serviceCode ? ` — ${r.serviceId.serviceCode}` : ''}
                  {r.status ? ` (${r.status})` : ''}
                </option>
              ))}
            </select>
          </div>
          {isRunning && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 self-end pb-2">
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Calculating…
            </div>
          )}
        </div>
      }
      summary={data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ReportStatCard label="Total Revenue"   value={fmtMoney(data.totalRevenue)} accent />
          <ReportStatCard label="Total Expenses"  value={fmtMoney(totalExpenses)}
            sub={Object.keys(data.expenseTotals || {}).join(' + ') || 'USD'} />
          <ReportStatCard label="Net P&L"         value={fmtMoney(netPnL)} accent={netPnL >= 0} />
          <ReportStatCard label="Bookings"        value={fmtNum(data.bookingCount)}
            sub={`${data.voyageCount} voyage${data.voyageCount !== 1 ? 's' : ''}`} />
        </div>
      )}
    >
      {/* Empty / select prompt */}
      {!roundId && (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          <p className="text-sm">Select a round to generate its P&L report</p>
        </div>
      )}

      {data && (
        <>
          {/* Round details grid */}
          <div className="card p-5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Round Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Round',   val: <span className="mono font-bold text-teal-600">{data.round.roundNumber}</span> },
                { label: 'Service', val: `${data.round.service?.serviceCode ?? '—'} — ${data.round.service?.serviceName ?? ''}` },
                { label: 'Vessel',  val: `${data.round.vessel?.vesselCode ?? '—'} ${data.round.vessel?.vesselName ?? ''}` },
                { label: 'Status',  val: data.round.status },
                { label: 'Start',   val: fmt(data.round.startDate) },
                { label: 'End',     val: fmt(data.round.endDate) },
                { label: 'Voyages', val: fmtNum(data.voyageCount) },
                { label: 'Total Units', val: fmtNum(data.totalQuantity) },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-sm text-gray-700 font-medium">{val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Multi-currency expense totals */}
          {Object.keys(data.expenseTotals || {}).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(data.expenseTotals).map(([cur, amt]) => (
                <ReportStatCard
                  key={cur}
                  label={`Total Expenses (${cur})`}
                  value={`${Number(amt).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${cur}`}
                />
              ))}
            </div>
          )}

          {/* P&L Chart */}
          {data.expenseBreakdown?.length > 0 && (
            <div className="card p-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Revenue vs Expenses</p>
              <div style={{ position: 'relative', height: 240 }}>
                <PnlChart expenseBreakdown={data.expenseBreakdown} totalRevenue={data.totalRevenue} />
              </div>
            </div>
          )}

          {/* Expense breakdown table */}
          {data.expenseBreakdown?.length > 0 ? (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Expense Breakdown by Category</h3>
                <span className="text-xs text-gray-400">{data.expenseBreakdown.length} categor{data.expenseBreakdown.length !== 1 ? 'ies' : 'y'}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="table-header">
                      {['Category', 'Currency', 'Amount', 'Count'].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenseBreakdown.map((e, i) => (
                      <tr key={i} className="table-row">
                        <td>
                          <span className="inline-flex items-center text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">
                            {e.category}
                          </span>
                        </td>
                        <td><span className="mono text-xs font-semibold text-gray-500">{e.currency}</span></td>
                        <td><span className="mono text-xs font-semibold text-red-600">{Number(e.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></td>
                        <td className="text-xs text-gray-500">{e.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <ReportEmptyState message="No expenses recorded for this round." />
          )}
        </>
      )}
    </ReportLayout>
  );
}
