'use client';

import { fromMinor } from '@/utils/money';
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Chart, registerables } from 'chart.js';
import { reportsService } from '@/services/reports.service';
import { roundsService }  from '@/services/rounds.service';
import { voyagesService } from '@/services/voyages.service';
import ReportLayout       from './ReportLayout';
import { ReportStatCard, ReportEmptyState, rsc, fmtMoney, fmtNum } from './reportHelpers';
import { getVoyageLabel } from '@/utils/voyageLabel';

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
  const [roundId, setRoundId]   = useState('');
  // Sprint 035 — optional Voyage narrows the report to voyage scope;
  // cascades from Round, same convention as BookingRevenueDetailsReport.jsx.
  const [voyageId, setVoyageId] = useState('');
  const [basis, setBasis] = useState(''); // Sprint 053: '' = legacy only, 'accrual' | 'cash' = ledger P&L

  // ── Rounds dropdown ────────────────────────────────────────────────────────
  const { data: roundsData } = useQuery({
    queryKey: ['rounds-dd-populated'],
    queryFn:  () => roundsService.list({ limit: 200 }).then(r => r.data),
  });
  // Response shape: { data: { data: [...], pagination } }
  const rounds = roundsData?.data || [];

  // ── Voyages dropdown (cascades from Round) ──────────────────────────────────
  const { data: voyageData } = useQuery({
    queryKey: ['voyages-dropdown', roundId],
    queryFn:  () => voyagesService.list({ roundId, limit: 200 }).then(r => r.data.data),
    enabled:  !!roundId,
  });
  const voyages = voyageData || [];

  // ── Report data ────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['report-round-pnl', roundId, voyageId, basis],
    queryFn:  () => reportsService.getRoundPnL({ roundId, voyageId: voyageId || undefined, basis: basis || undefined }).then(r => r.data.data),
    enabled:  !!roundId,
  });

  // ── Computed values ────────────────────────────────────────────────────────
  const totalExpenses = data ? Object.values(data.expenseTotals || {}).reduce((a, b) => a + b, 0) : 0;
  const isRunning     = isLoading || isFetching;

  return (
    <ReportLayout
      title="Voyage Profitability Report"
      subtitle="Revenue, Voyage Cost and Other Voyage Cost for a round or a single voyage within it"
      filters={
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Select Round</p>
            <select
              value={roundId}
              onChange={e => { setRoundId(e.target.value); setVoyageId(''); }}
              className={rsc}
              style={{ minWidth: 240 }}
            >
              <option value="">Choose a round…</option>
              {rounds.map(r => (
                <option key={r._id} value={r._id}>
                  {r.roundNumber} ({r.roundName || 'unnamed'})
                  {r.serviceId?.serviceCode ? ` — ${r.serviceId.serviceCode}` : ''}
                  {r.status ? ` (${r.status})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Voyage (optional)</p>
            <select
              value={voyageId}
              onChange={e => setVoyageId(e.target.value)}
              disabled={!roundId}
              className={`${rsc} disabled:opacity-50`}
              style={{ minWidth: 200 }}
            >
              <option value="">All Voyages (Round)</option>
              {voyages.map(v => (
                <option key={v._id} value={v._id}>{getVoyageLabel(v)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Ledger basis</label>
            <select value={basis} onChange={e => setBasis(e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white cursor-pointer focus:outline-none">
              <option value="">Off (operational report)</option>
              <option value="accrual">Accrual (ledger)</option>
              <option value="cash">Cash (ledger)</option>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <ReportStatCard label="Revenue (Final Loading)" value={fmtMoney(data.summary?.totalRevenue)} accent
            sub={`${data.scope === 'voyage' ? '1 voyage' : `${data.voyages?.length || 0} voyages`}`} />
          <ReportStatCard label="Voyage Cost"     value={fmtMoney(data.summary?.totalVoyageCost)} />
          <ReportStatCard label="Other Voyage Cost" value={fmtMoney(data.summary?.totalOtherVoyageCost)} />
          <ReportStatCard label="Net Profit"      value={fmtMoney(data.summary?.netProfit)} accent={(data.summary?.netProfit ?? 0) >= 0} />
          <ReportStatCard label="Profit / TEU"    value={fmtMoney(data.summary?.profitPerTEU)}
            sub={`${fmtNum(data.summary?.totalTEU)} TEU`} />
          <ReportStatCard label="Profit Margin"   value={`${(data.summary?.profitMarginPct ?? 0).toFixed(1)}%`} />
        </div>
      )}
    >
      {/* Sprint 053 S6 - ledger P&L (only when the accounting flag is on and a basis is chosen) */}
      {data?.ledgerPnl && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Ledger P&amp;L - {data.ledgerPnl.basis} ({data.ledgerPnl.currency})</p>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13 }}>
            <span>Revenue <b>{fromMinor(data.ledgerPnl.revenueMinor, 'USD')}</b></span>
            <span>Expenses <b>{fromMinor(data.ledgerPnl.expenseMinor, 'USD')}</b></span>
            <span>Profit <b>{fromMinor(data.ledgerPnl.profitMinor, 'USD')}</b></span>
          </div>
        </div>
      )}

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
                { label: 'Round',   val: <span className="mono font-bold text-teal-600">{data.round.roundNumber} <span className="font-normal text-teal-500">({data.round.roundName || 'unnamed'})</span></span> },
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

          {/* ── Sprint 035 — Revenue by Voyage (Layer 2, Final Loading only) ── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Revenue by Voyage</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Final Loading bookings only (Layer 2)</p>
            </div>
            {data.voyages?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="table-header">
                      {['Voyage', 'POL', 'POD', 'Bookings', 'TEUs', 'VGM (MT)', 'Revenue'].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.voyages.map(v => (
                      <tr key={v.voyageId} className="table-row">
                        <td className="mono text-xs font-semibold text-teal-700">{getVoyageLabel(v)}</td>
                        <td className="text-xs text-gray-500">{v.revenue.polName || v.polName || '—'}</td>
                        <td className="text-xs text-gray-500">{v.revenue.podName || v.podName || '—'}</td>
                        <td className="text-xs text-gray-600">{fmtNum(v.revenue.bookingCount)}</td>
                        <td className="text-xs text-gray-600">{fmtNum(v.revenue.teus)}</td>
                        <td className="text-xs text-gray-600">{fmtNum(v.revenue.vgm)}</td>
                        <td className="mono text-xs font-bold text-teal-700">{fmtMoney(v.revenue.totalRevenue)}</td>
                      </tr>
                    ))}
                    <tr className="bg-teal-50 font-semibold border-t-2 border-teal-200">
                      <td colSpan={3} className="px-4 py-2.5 text-xs font-bold text-gray-700">TOTAL</td>
                      <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(data.voyages.reduce((s, v) => s + v.revenue.bookingCount, 0))}</td>
                      <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(data.summary?.totalTEU)}</td>
                      <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(data.voyages.reduce((s, v) => s + v.revenue.vgm, 0))}</td>
                      <td className="px-4 py-2.5 mono text-xs font-bold text-teal-700">{fmtMoney(data.summary?.totalRevenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <ReportEmptyState message="No Final Loading bookings in this scope." />
            )}
          </div>

          {/* ── Sprint 035 — Voyage Cost, broken out per voyage even in Round scope ── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Voyage Cost</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Per voyage, per port — categories classified as &quot;Voyage Cost&quot; in Expense Types</p>
            </div>
            {data.voyages?.some(v => v.voyageCost.total > 0) || data.roundLevelVoyageCost?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="table-header">
                      {['Voyage', 'Port', 'Amount'].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.voyages?.flatMap(v => (
                      v.voyageCost.byPort.length > 0
                        ? v.voyageCost.byPort.map((p, i) => (
                          <tr key={`${v.voyageId}-${p.portId || p.portName}`} className="table-row">
                            {i === 0 && <td rowSpan={v.voyageCost.byPort.length} className="mono text-xs font-semibold text-teal-700 align-top">{getVoyageLabel(v)}</td>}
                            <td className="text-xs text-gray-500">{p.portName}</td>
                            <td className="mono text-xs font-semibold text-red-600">{fmtMoney(p.total)}</td>
                          </tr>
                        ))
                        : []
                    ))}
                    {data.roundLevelVoyageCost?.map(r => (
                      <tr key={r.expenseTypeName} className="table-row">
                        <td className="text-xs text-gray-400 italic">Round-level</td>
                        <td className="text-xs text-gray-500">{r.expenseTypeName}</td>
                        <td className="mono text-xs font-semibold text-red-600">{fmtMoney(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="bg-teal-50 font-semibold border-t-2 border-teal-200">
                      <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-gray-700">TOTAL VOYAGE COST</td>
                      <td className="px-4 py-2.5 mono text-xs font-bold text-red-700">{fmtMoney(data.summary?.totalVoyageCost)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <ReportEmptyState message="No Voyage Cost expenses recorded for this scope." />
            )}
          </div>

          {/* ── Sprint 035 — Other Voyage Cost, aggregated by SCOPE ONLY (never per voyage) ── */}
          <div className="card p-5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              Other Voyage Cost{data.scope === 'voyage' ? ' (this voyage)' : ' (entire round)'}
            </p>
            <p className="text-[11px] text-gray-400 mb-4">
              Categories classified as &quot;Other Voyage Cost&quot; · includes Hire Rate (rate × voyage duration)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Hire Rate Cost</p>
                <p className="text-sm text-gray-700 font-medium">{fmtMoney(data.otherVoyageCost?.hireRateCost)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Other Expenses</p>
                <p className="text-sm text-gray-700 font-medium">{fmtMoney(data.otherVoyageCost?.otherExpenseCost)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Total Other Voyage Cost</p>
                <p className="text-sm font-bold text-red-600">{fmtMoney(data.otherVoyageCost?.total)}</p>
              </div>
            </div>
            {data.otherVoyageCost?.breakdown?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="table-header">
                      {['Category', 'Amount', 'Count'].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.otherVoyageCost.breakdown.map(b => (
                      <tr key={b.category} className="table-row">
                        <td>
                          <span className="inline-flex items-center text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full font-medium">{b.category}</span>
                        </td>
                        <td className="mono text-xs font-semibold text-red-600">{fmtMoney(b.total)}</td>
                        <td className="text-xs text-gray-500">{b.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
