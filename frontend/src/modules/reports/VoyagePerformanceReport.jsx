'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Chart, registerables } from 'chart.js';
import { reportsService }  from '@/services/reports.service';
import { servicesService } from '@/services/services.service';
import { roundsService }   from '@/services/rounds.service';
import { VOYAGE_STATUS }   from '@/utils/constants';
import ReportLayout        from './ReportLayout';
import { ReportStatCard, ReportEmptyState, rsc, fmtMoney, fmtNum } from './reportHelpers';
import Badge from '@/components/ui/Badge';

Chart.register(...registerables);

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

// ── Horizontal Bar Chart — top voyages by freight ─────────────────────────────
function VoyageFreightChart({ rows = [] }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !rows.length) return;
    if (chartRef.current) chartRef.current.destroy();

    const top    = [...rows].sort((a, b) => b.totalFreight - a.totalFreight).slice(0, 10);
    const labels = top.map(r => r.voyageNumber);
    const data   = top.map(r => r.totalFreight);

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Freight (USD)',
          data,
          backgroundColor: '#0D9488',
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` $${Number(ctx.raw).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { callback: v => `$${(v/1000).toFixed(0)}k`, font: { size: 11 } },
            grid: { color: '#F3F4F6' },
          },
          y: {
            ticks: { font: { size: 11 } },
            grid: { display: false },
          },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [rows]);

  if (!rows.length) return null;
  return <canvas ref={canvasRef} style={{ height: Math.min(rows.length * 36 + 40, 380) }} />;
}

export default function VoyagePerformanceReport() {
  const [serviceId, setServiceId] = useState('');
  const [roundId,   setRoundId]   = useState('');
  const [status,    setStatus]    = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [hasRun,    setHasRun]    = useState(false);

  // ── Dropdowns ──────────────────────────────────────────────────────────────
  const { data: svcData } = useQuery({
    queryKey: ['services-active-dropdown'],
    queryFn:  () => servicesService.listActive().then(r => r.data.data),
  });
  const { data: rdData } = useQuery({
    queryKey: ['rounds-dd-populated'],
    queryFn:  () => roundsService.list({ limit: 200 }).then(r => r.data),
  });
  const services = svcData || [];
  const allRounds = rdData?.data || [];
  const rounds = allRounds.filter(r =>
    !serviceId || String(r.serviceId?._id || r.serviceId) === serviceId
  );

  // ── Report — uses refetch() pattern so "Run Report" always fires ───────────
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report-voyage-perf'],
    queryFn:  () => reportsService.getVoyagePerformance({
      serviceId, roundId, status, dateFrom, dateTo,
    }).then(r => r.data.data),
    enabled: false,   // ← never auto-runs; only fires via refetch()
  });

  const handleRun = () => { setHasRun(true); refetch(); };

  const rows   = data?.rows   || [];
  const totals = data?.totals || {};
  const isRunning = isLoading || isFetching;

  return (
    <ReportLayout
      title="Voyage Performance"
      subtitle="Booking counts, freight and slot utilisation per voyage"
      filters={
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Service</p>
            <select value={serviceId} onChange={e => { setServiceId(e.target.value); setRoundId(''); }} className={rsc}>
              <option value="">All Services</option>
              {services.map(s => <option key={s._id} value={s._id}>{s.serviceCode}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Round</p>
            <select value={roundId} onChange={e => setRoundId(e.target.value)} className={rsc}>
              <option value="">All Rounds</option>
              {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Status</p>
            <select value={status} onChange={e => setStatus(e.target.value)} className={rsc}>
              <option value="">All</option>
              {VOYAGE_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">ETD From</p>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">ETD To</p>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="btn btn-primary btn-md flex items-center gap-1.5"
          >
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
          <ReportStatCard label="Voyages"        value={fmtNum(rows.length)} />
          <ReportStatCard label="Total Bookings" value={fmtNum(totals.bookingCount)} />
          <ReportStatCard label="Total Freight"  value={fmtMoney(totals.totalFreight)} accent />
          <ReportStatCard label="Total Slots"    value={fmtNum(totals.totalSlots)}
            sub={`${fmtNum(totals.totalQty)} units`} />
        </div>
      )}
    >
      {!hasRun ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <p className="text-sm">Set filters and click "Run Report"</p>
        </div>
      ) : rows.length === 0 && !isRunning ? (
        <ReportEmptyState />
      ) : (
        <>
          {/* Chart */}
          {rows.length > 0 && (
            <div className="card p-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                Top Voyages by Freight Revenue
              </p>
              <div style={{ position: 'relative' }}>
                <VoyageFreightChart rows={rows} />
              </div>
            </div>
          )}

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="table-header">
                    {['Voyage', 'Service', 'Round', 'POL', 'POD', 'ETD', 'ETA', 'Bookings', 'Slots', 'Freight', 'Status'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r._id} className={`table-row ${r.bookingCount === 0 ? 'opacity-50' : ''}`}>
                      <td><span className="mono text-xs font-bold text-teal-600">{r.voyageNumber}</span></td>
                      <td><span className="mono text-xs text-gray-500">{r.serviceCode}</span></td>
                      <td><span className="mono text-xs text-gray-500">{r.roundNumber}</span></td>
                      <td className="text-xs text-gray-700">{r.polName || '—'}</td>
                      <td className="text-xs text-gray-700">{r.podName || '—'}</td>
                      <td className="text-xs text-gray-500">{fmt(r.etd)}</td>
                      <td className="text-xs text-gray-500">{fmt(r.eta)}</td>
                      <td className="text-xs text-gray-600 font-medium">{fmtNum(r.bookingCount)}</td>
                      <td className="text-xs text-gray-600">{fmtNum(r.totalSlots)}</td>
                      <td><span className="mono text-xs font-semibold text-teal-700">{fmtMoney(r.totalFreight)}</span></td>
                      <td><Badge label={r.status} /></td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-teal-50 font-semibold border-t-2 border-teal-200">
                    <td colSpan={7} className="px-4 py-2.5 text-xs font-bold text-gray-600">TOTALS</td>
                    <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(totals.bookingCount)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(totals.totalSlots)}</td>
                    <td className="px-4 py-2.5 mono text-xs font-bold text-teal-700">{fmtMoney(totals.totalFreight)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </ReportLayout>
  );
}
