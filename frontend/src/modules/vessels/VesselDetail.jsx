'use client';

import { useEffect, useRef } from 'react';
import { useQuery }          from '@tanstack/react-query';
import { useRouter }         from 'next/navigation';
import { Chart, registerables } from 'chart.js';
import { vesselsService }    from '@/services/vessels.service';
import { usePermission }     from '@/context/PermissionContext';
import Badge                 from '@/components/ui/Badge';
import LoadingSpinner        from '@/components/ui/LoadingSpinner';

// react-icons
import { GiCargoShip }        from 'react-icons/gi';
import { FaClipboardList }    from 'react-icons/fa';
import { MdAnchor }           from 'react-icons/md';
import { MdOutlineSailing }   from 'react-icons/md';
import { MdMyLocation }       from 'react-icons/md';
import { FaUsers }            from 'react-icons/fa';

Chart.register(...registerables);

const fmt      = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const fmtDT    = (d) => d ? new Date(d).toLocaleString('en-GB',   { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—';
const fmtNum   = (n) => (n ?? 0).toLocaleString();

// Status colours for tracking chips
const TRACKING_COLORS = {
  'At Port':    'bg-blue-100 text-blue-700',
  'Departed':   'bg-amber-100 text-amber-700',
  'In Transit': 'bg-purple-100 text-purple-700',
  'Arrived':    'bg-green-100 text-green-700',
  'Anchored':   'bg-gray-100 text-gray-600',
  'Delayed':    'bg-red-100 text-red-600',
};

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, iconBg, iconColor }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className={`text-xl ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl font-bold text-gray-800 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, iconColor = 'text-teal-600', iconBg = 'bg-teal-50', action }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2.5">
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`text-sm ${iconColor}`} />
        </div>
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      {action}
    </div>
  );
}

// ── Booking status doughnut ───────────────────────────────────────────────────
const BOOKING_COLORS = {
  'Confirmed':     '#0D9488',
  'Pending':       '#F59E0B',
  'Final Loading': '#3B82F6',
  'Cancelled':     '#F87171',
};

function BookingDoughnut({ items }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !items?.length) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, {
      type: 'doughnut',
      data: {
        labels:   items.map(i => i.label),
        datasets: [{
          data:            items.map(i => i.count),
          backgroundColor: items.map(i => BOOKING_COLORS[i.label] || '#9CA3AF'),
          borderWidth: 2, borderColor: '#fff', hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [items]);

  if (!items?.length) return <div className="flex items-center justify-center h-48 text-gray-300 text-sm">No bookings yet</div>;
  return <canvas ref={ref} style={{ height: 220 }} />;
}

// ── Capacity bar ──────────────────────────────────────────────────────────────
function CapacityBar({ capacity, capacityUsed, capacityPct }) {
  if (!capacity) {
    return (
      <div className="card p-5">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Capacity Utilisation</p>
        <p className="text-sm text-gray-400 italic">No capacity defined for this vessel.</p>
      </div>
    );
  }
  const pct     = capacityPct ?? 0;
  const color   = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-teal-500';
  const remaining = capacity - capacityUsed;

  return (
    <div className="card p-5">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Capacity Utilisation (Active Rounds)</p>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-700">{fmtNum(capacityUsed)} TEU booked</span>
        <span className="text-sm font-bold text-gray-800">{pct}%</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Total Capacity', val: `${fmtNum(capacity)} TEU`, color: 'text-gray-700' },
          { label: 'Booked',         val: `${fmtNum(capacityUsed)} TEU`, color: 'text-teal-600' },
          { label: 'Available',      val: `${fmtNum(remaining)} TEU`, color: remaining > 0 ? 'text-green-600' : 'text-red-500' },
        ].map(({ label, val, color: c }) => (
          <div key={label} className="bg-gray-50 rounded-xl py-2 px-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`text-sm font-bold mt-0.5 ${c}`}>{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main VesselDetail ─────────────────────────────────────────────────────────
export default function VesselDetail({ id }) {
  const router  = useRouter();
  const { can } = usePermission();

  const { data: raw, isLoading, isError, error } = useQuery({
    queryKey: ['vessel-stats', id],
    queryFn:  () => vesselsService.getStats(id).then(r => r.data.data),
    retry: 1,
  });

  if (isLoading) return <LoadingSpinner fullPage />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">Failed to load vessel details</p>
          <p className="text-xs text-gray-400 mt-1">{error?.response?.data?.message || error?.message || 'Unknown error'}</p>
        </div>
        <button onClick={() => router.push('/vessels')} className="btn btn-secondary btn-md">← Back to Vessels</button>
      </div>
    );
  }

  if (!raw) return null;

  const { vessel, stats, rounds, voyages, agents, recentTracking, lastPosition, bookingsByStatus } = raw;

  return (
    <div className="animate-fadeIn flex flex-col gap-5">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <button onClick={() => router.push('/vessels')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition mb-2">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Vessels
          </button>
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
              <GiCargoShip className="text-xl text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="mono text-xl font-bold text-gray-800">{vessel.vesselCode}</span>
                <span className="text-gray-300">·</span>
                <span className="text-xl font-semibold text-gray-700">{vessel.vesselName}</span>
                <Badge label={vessel.status} />
                {lastPosition && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TRACKING_COLORS[lastPosition.status] || 'bg-gray-100 text-gray-600'}`}>
                    {lastPosition.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {vessel.imoNumber && `IMO ${vessel.imoNumber}`}
                {vessel.flag && ` · ${vessel.flag}`}
                {vessel.ownershipType && ` · ${vessel.ownershipType}`}
                {vessel.builtYear && ` · Built ${vessel.builtYear}`}
              </p>
            </div>
          </div>
          {lastPosition && (
            <p className="text-xs text-gray-400 ml-13">
              Last position: <span className="font-medium text-gray-600">{lastPosition.portId?.name}</span>
              {lastPosition.terminalId?.name && ` — ${lastPosition.terminalId.name}`}
              <span className="text-gray-300 mx-1">·</span>
              {fmtDT(lastPosition.lastUpdate)}
            </p>
          )}
        </div>
        {can('vessels', 'update') && (
          <button onClick={() => router.push(`/vessels/${id}/edit`)} className="btn btn-secondary btn-md">
            Edit Vessel
          </button>
        )}
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={MdAnchor}        label="Total Rounds"   value={fmtNum(stats.totalRounds)}
          sub={`${fmtNum(stats.activeRoundsCount)} active · ${fmtNum(stats.plannedRoundsCount)} planned`}
          iconBg="bg-purple-50" iconColor="text-purple-600" />
        <KpiCard icon={MdOutlineSailing} label="Total Voyages"  value={fmtNum(stats.totalVoyages)}
          sub={`${fmtNum(stats.activeVoyages)} active`}
          iconBg="bg-sky-50" iconColor="text-sky-600" />
        <KpiCard icon={FaClipboardList}  label="Total Bookings" value={fmtNum(stats.totalBookings)}
          sub={`${fmtNum(stats.confirmedBookings)} confirmed`}
          iconBg="bg-teal-50" iconColor="text-teal-600" />
        <KpiCard icon={GiCargoShip}      label="Total Revenue"  value={fmtMoney(stats.totalRevenue)}
          sub="All bookings"
          iconBg="bg-green-50" iconColor="text-green-600" />
      </div>

      {/* ── Capacity bar ────────────────────────────────────────────── */}
      <CapacityBar
        capacity={vessel.capacity}
        capacityUsed={stats.capacityUsed}
        capacityPct={stats.capacityPct}
      />

      {/* ── Overview + Booking chart ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Vessel overview — 3 cols */}
        <div className="lg:col-span-3 card overflow-hidden">
          <SectionHeader icon={MdAnchor} title="Vessel Overview" />
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            {[
              { label: 'Vessel Code',  val: vessel.vesselCode },
              { label: 'Vessel Name',  val: vessel.vesselName },
              { label: 'IMO Number',   val: vessel.imoNumber },
              { label: 'Flag',         val: vessel.flag },
              { label: 'Call Sign',    val: vessel.callSign },
              { label: 'Ownership',    val: vessel.ownershipType },
              { label: 'Owner',        val: vessel.ownerName },
              { label: 'Capacity',     val: vessel.capacity != null ? `${vessel.capacity.toLocaleString()} TEU` : null },
              { label: 'DWT',          val: vessel.dwt != null ? `${vessel.dwt.toLocaleString()} t` : null },
              { label: 'Built Year',   val: vessel.builtYear },
              { label: 'Status',       val: vessel.status },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-[13px] font-medium text-gray-700">{val || <span className="text-gray-300">—</span>}</p>
              </div>
            ))}
            {vessel.ownershipDescription && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Ownership Notes</p>
                <p className="text-[13px] text-gray-600 leading-relaxed">{vessel.ownershipDescription}</p>
              </div>
            )}
            {vessel.notes && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Notes</p>
                <p className="text-[13px] text-gray-600 leading-relaxed">{vessel.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Booking doughnut — 2 cols */}
        <div className="lg:col-span-2 card overflow-hidden">
          <SectionHeader icon={FaClipboardList} title="Bookings by Status" iconBg="bg-teal-50" />
          <div className="p-5 flex flex-col" style={{ minHeight: 280 }}>
            <div className="flex-1 flex items-center justify-center">
              <BookingDoughnut items={bookingsByStatus} />
            </div>
            {/* Quick counts */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { label: 'Pending',       count: stats.pendingBookings,      color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Confirmed',     count: stats.confirmedBookings,    color: 'text-teal-600',  bg: 'bg-teal-50' },
                { label: 'Final Loading', count: stats.finalLoadingBookings, color: 'text-blue-600',  bg: 'bg-blue-50' },
                { label: 'Cancelled',     count: stats.cancelledBookings,    color: 'text-red-500',   bg: 'bg-red-50' },
              ].map(({ label, count, color, bg }) => (
                <div key={label} className={`${bg} rounded-lg px-3 py-2 flex items-center justify-between`}>
                  <span className="text-[11px] font-semibold text-gray-600">{label}</span>
                  <span className={`text-sm font-bold ${color}`}>{fmtNum(count)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Agents ──────────────────────────────────────────────────── */}
      {agents.length > 0 && (
        <div className="card overflow-hidden">
          <SectionHeader icon={FaUsers} title="Agents Handling This Vessel" iconBg="bg-indigo-50" iconColor="text-indigo-600" />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="table-header">
                  <th>#</th><th>Agent Code</th><th>Agent Name</th><th>Bookings</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a, idx) => (
                  <tr key={a._id || idx} className="table-row">
                    <td className="text-gray-400 w-10">{idx + 1}</td>
                    <td><span className="mono text-xs font-bold text-teal-600">{a.agentCode || '—'}</span></td>
                    <td className="font-medium text-gray-700">{a.agentName || '—'}</td>
                    <td>
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 bg-teal-50 text-teal-700 text-xs font-bold rounded-full px-2">
                        {a.bookingCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Rounds history ──────────────────────────────────────────── */}
      {rounds.length > 0 && (
        <div className="card overflow-hidden">
          <SectionHeader icon={MdAnchor} title="Round History" iconBg="bg-purple-50" iconColor="text-purple-600"
            action={<span className="text-[11px] text-gray-400">{stats.totalRounds} total</span>}
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="table-header">
                  {['Round No','Service','Start','End','Status'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rounds.map(r => (
                  <tr key={r._id} className="table-row">
                    <td><span className="mono text-xs font-bold text-gray-700">{r.roundNumber}</span></td>
                    <td><span className="mono text-xs text-teal-600">{r.serviceId?.serviceCode}</span></td>
                    <td className="text-xs text-gray-600">{fmt(r.startDate)}</td>
                    <td className="text-xs text-gray-600">{fmt(r.endDate)}</td>
                    <td><Badge label={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Recent voyages ──────────────────────────────────────────── */}
      {voyages.length > 0 && (
        <div className="card overflow-hidden">
          <SectionHeader icon={MdOutlineSailing} title="Recent Voyages" iconBg="bg-sky-50" iconColor="text-sky-600"
            action={<span className="text-[11px] text-gray-400">{stats.totalVoyages} total</span>}
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="table-header">
                  {['Voyage No','POL','POD','ETD','ETA','Status'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {voyages.map(v => (
                  <tr key={v._id} className="table-row">
                    <td><span className="mono text-xs font-bold text-gray-700">{v.voyageNumber}</span></td>
                    <td className="text-xs text-gray-700">{v.polId?.name || '—'}</td>
                    <td className="text-xs text-gray-700">{v.podId?.name || '—'}</td>
                    <td className="text-xs text-gray-500">{fmt(v.etd)}</td>
                    <td className="text-xs text-gray-500">{fmt(v.eta)}</td>
                    <td><Badge label={v.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tracking history ────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <SectionHeader icon={MdMyLocation} title="Recent Tracking" iconBg="bg-rose-50" iconColor="text-rose-600"
          action={
            <button onClick={() => router.push(`/tracking?vesselId=${id}`)}
              className="text-xs text-teal-600 font-semibold hover:text-teal-800 transition">
              View all →
            </button>
          }
        />
        {recentTracking.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-gray-300 text-sm">No tracking entries yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="table-header">
                  {['Date/Time','Voyage','Port','Terminal','Status','Remarks'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {recentTracking.map(t => (
                  <tr key={t._id} className="table-row">
                    <td className="text-xs text-gray-600 whitespace-nowrap">{fmtDT(t.lastUpdate)}</td>
                    <td><span className="mono text-xs font-semibold text-teal-600">{t.voyageId?.voyageNumber || '—'}</span></td>
                    <td className="text-xs text-gray-700">{t.portId?.name || '—'}</td>
                    <td className="text-xs text-gray-500">{t.terminalId?.name || '—'}</td>
                    <td>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TRACKING_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="text-xs text-gray-400 max-w-[180px] truncate">{t.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
