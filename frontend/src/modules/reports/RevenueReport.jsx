'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Chart, registerables } from 'chart.js';
import { reportsService }  from '@/services/reports.service';
import { servicesService } from '@/services/services.service';
import ReportLayout  from './ReportLayout';
import { ReportStatCard, ReportEmptyState, rsc, fmtMoney, fmtNum } from './reportHelpers';

Chart.register(...registerables);

// ── Revenue Doughnut Chart ────────────────────────────────────────────────────
const PALETTE = ['#0D9488','#6366F1','#F59E0B','#EC4899','#10B981','#3B82F6'];

function RevenueDoughnut({ rows = [] }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !rows.length) return;
    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels:   rows.map(r => r.serviceCode),
        datasets: [{
          data:            rows.map(r => r.totalRevenue),
          backgroundColor: rows.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth:     2,
          borderColor:     '#fff',
          hoverOffset:     8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
          tooltip: {
            callbacks: {
              label: ctx => ` $${Number(ctx.raw).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            },
          },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [rows]);

  if (!rows.length) return null;
  return <canvas ref={canvasRef} style={{ height: 280 }} />;
}

export default function RevenueReport() {
  const [serviceId, setServiceId] = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [hasRun,    setHasRun]    = useState(false);

  const { data: svcData } = useQuery({
    queryKey: ['services-active-dropdown'],
    queryFn:  () => servicesService.listActive().then(r => r.data.data),
  });
  const services = svcData || [];

  // ── refetch() pattern — fires on every button click ───────────────────────
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report-revenue'],
    queryFn:  () => reportsService.getRevenueReport({ serviceId, dateFrom, dateTo }).then(r => r.data.data),
    enabled:  false,
  });

  const handleRun = () => { setHasRun(true); refetch(); };

  const rows       = data?.rows       || [];
  const grandTotal = data?.grandTotal || {};
  const isRunning  = isLoading || isFetching;

  // Share % helper
  const sharePct = (v) => grandTotal.totalRevenue > 0
    ? Math.round((v / grandTotal.totalRevenue) * 100)
    : 0;

  return (
    <ReportLayout
      title="Revenue Report"
      subtitle="Total freight revenue grouped by service"
      filters={
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Service</p>
            <select value={serviceId} onChange={e => setServiceId(e.target.value)} className={rsc}>
              <option value="">All Services</option>
              {services.map(s => <option key={s._id} value={s._id}>{s.serviceCode} — {s.serviceName}</option>)}
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
          <ReportStatCard label="Services"      value={fmtNum(rows.length)} />
          <ReportStatCard label="Voyages"       value={fmtNum(grandTotal.voyageCount)} />
          <ReportStatCard label="Bookings"      value={fmtNum(grandTotal.bookingCount)} />
          <ReportStatCard label="Total Revenue" value={fmtMoney(grandTotal.totalRevenue)} accent />
        </div>
      )}
    >
      {!hasRun ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p className="text-sm">Set filters and click "Run Report"</p>
        </div>
      ) : rows.length === 0 && !isRunning ? (
        <ReportEmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Table — 3 cols */}
          <div className="lg:col-span-3 card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="table-header">
                    {['Service Code', 'Service Name', 'Voyages', 'Bookings', 'Units', 'Revenue', 'Share'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const pct = sharePct(r.totalRevenue);
                    return (
                      <tr key={r._id} className="table-row">
                        <td>
                          <span className="mono text-xs font-bold text-teal-600">{r.serviceCode}</span>
                        </td>
                        <td className="text-xs text-gray-700 max-w-[140px] truncate">{r.serviceName}</td>
                        <td className="text-xs text-gray-600">{fmtNum(r.voyageCount)}</td>
                        <td className="text-xs text-gray-600">{fmtNum(r.bookingCount)}</td>
                        <td className="text-xs text-gray-600">{fmtNum(r.totalQty)}</td>
                        <td>
                          <span className="mono text-xs font-bold text-teal-700">{fmtMoney(r.totalRevenue)}</span>
                          {/* Share bar */}
                          <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden w-20">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: PALETTE[idx % PALETTE.length] }}
                            />
                          </div>
                        </td>
                        <td className="text-xs font-semibold text-gray-500">{pct}%</td>
                      </tr>
                    );
                  })}
                  {/* Grand total */}
                  <tr className="bg-teal-50 font-semibold border-t-2 border-teal-200">
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-gray-700">GRAND TOTAL</td>
                    <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(grandTotal.voyageCount)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(grandTotal.bookingCount)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold">{fmtNum(grandTotal.totalQty)}</td>
                    <td className="px-4 py-2.5 mono text-xs font-bold text-teal-700" colSpan={2}>
                      {fmtMoney(grandTotal.totalRevenue)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Doughnut chart — 2 cols */}
          <div className="lg:col-span-2 card p-5 flex flex-col">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Revenue Share</p>
            <div className="flex-1 flex items-center justify-center" style={{ minHeight: 280 }}>
              <RevenueDoughnut rows={rows} />
            </div>
          </div>
        </div>
      )}
    </ReportLayout>
  );
}
