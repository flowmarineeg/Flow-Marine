'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

// Sprint020 PERF-006: register only what's used instead of ...registerables
// Saves ~120KB from the dashboard bundle
import {
  Chart,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement,
  LineController, BarController, DoughnutController,
  Tooltip, Legend, Filler,
} from 'chart.js';

Chart.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement,
  LineController, BarController, DoughnutController,
  Tooltip, Legend, Filler,
);

import { dashboardService } from '@/services/dashboard.service';
import { useAuth }          from '@/context/AuthContext';
import LoadingSpinner       from '@/components/ui/LoadingSpinner';

import { GiCargoShip }        from 'react-icons/gi';
import { TbClockPlay }         from 'react-icons/tb';
import { FaClipboardList, FaMoneyBillWave, FaFileInvoiceDollar } from 'react-icons/fa';
import { MdSchedule, MdOutlineSailing, MdWarning, MdPersonOutline, MdAnchor } from 'react-icons/md';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (n) => n != null
  ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  : '$0';
const fmtNum = (n) => (n ?? 0).toLocaleString();
const relativeTime = (ts) => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const ACTION_STYLES = {
  CREATE: { bg: '#D1FAE5', color: '#065F46', label: 'Created' },
  UPDATE: { bg: '#DBEAFE', color: '#1E40AF', label: 'Updated' },
  DELETE: { bg: '#FEE2E2', color: '#991B1B', label: 'Deleted' },
  LOGIN:  { bg: '#F3F4F6', color: '#374151', label: 'Login'   },
  LOGOUT: { bg: '#F3F4F6', color: '#374151', label: 'Logout'  },
};

const MODULE_ROUTES = {
  services:'/services', rounds:'/rounds', voyages:'/voyages',
  bookings:'/bookings', expenses:'/expenses', invoices:'/invoices',
  vessels:'/vessels', agents:'/agents', users:'/users',
};

const PALETTE = ['#0D9488','#6366F1','#F59E0B','#EC4899','#10B981','#3B82F6','#8B5CF6'];

const BOOKING_STATUS_COLORS = { Confirmed:'#0D9488', Pending:'#F59E0B', Cancelled:'#F87171' };
const VOYAGE_STATUS_COLORS  = { Scheduled:'#6366F1', Departed:'#F59E0B', 'In Transit':'#3B82F6', Arrived:'#10B981', Completed:'#0D9488', Cancelled:'#F87171' };
const INVOICE_STATUS_COLORS = { Draft:'#9CA3AF', Issued:'#3B82F6', Paid:'#0D9488', Overdue:'#F87171', Cancelled:'#EF4444' };

// ── Chart components — Sprint020 PERF-007: update instead of destroy/recreate ─
function MonthlyTrendChart({ data }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !data) return;

    if (chartRef.current) {
      // Update existing chart data — no destroy/recreate
      chartRef.current.data.labels                    = data.labels;
      chartRef.current.data.datasets[0].data          = data.freight;
      chartRef.current.data.datasets[1].data          = data.counts;
      chartRef.current.update('none'); // 'none' skips animation for data refresh
      return;
    }

    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels:   data.labels,
        datasets: [
          {
            label: 'Freight Revenue ($)', data: data.freight,
            borderColor: '#0D9488', backgroundColor: 'rgba(13,148,136,0.12)',
            borderWidth: 2.5, pointBackgroundColor: '#0D9488', pointRadius: 4,
            fill: true, tension: 0.4, yAxisID: 'y',
          },
          {
            label: 'Booking Count', data: data.counts,
            borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.08)',
            borderWidth: 2, pointBackgroundColor: '#6366F1', pointRadius: 3,
            fill: true, tension: 0.4, yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 0 ? ` Revenue: $${Number(ctx.raw).toLocaleString()}` : ` Bookings: ${ctx.raw}` } },
        },
        scales: {
          y:  { type:'linear', position:'left',  beginAtZero:true, ticks:{ callback: v=>`$${(v/1000).toFixed(0)}k`, font:{size:11} }, grid:{color:'#F3F4F6'} },
          y1: { type:'linear', position:'right', beginAtZero:true, ticks:{ font:{size:11} }, grid:{drawOnChartArea:false} },
          x:  { ticks:{ font:{size:11} }, grid:{display:false} },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [data]);

  return <canvas ref={ref} style={{ height: 240 }} />;
}

function RevenueBarChart({ data }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !data?.length) return;

    if (chartRef.current) {
      chartRef.current.data.labels            = data.map(r => r.label);
      chartRef.current.data.datasets[0].data  = data.map(r => r.value);
      chartRef.current.update('none');
      return;
    }

    chartRef.current = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels:   data.map(r => r.label),
        datasets: [{ label:'Revenue', data:data.map(r=>r.value), backgroundColor:data.map((_,i)=>PALETTE[i%PALETTE.length]), borderRadius:5, borderSkipped:false }],
      },
      options: {
        indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:ctx=>` $${Number(ctx.raw).toLocaleString()}` } } },
        scales:{ x:{ beginAtZero:true, ticks:{callback:v=>`$${(v/1000).toFixed(0)}k`, font:{size:11}}, grid:{color:'#F3F4F6'} }, y:{ ticks:{font:{size:11}}, grid:{display:false} } },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [data]);

  return <canvas ref={ref} style={{ height: 220 }} />;
}

function DoughnutChart({ items = [], colorMap = {}, title }) {
  const ref      = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !items.length) return;

    if (chartRef.current) {
      chartRef.current.data.labels           = items.map(i => i.label);
      chartRef.current.data.datasets[0].data = items.map(i => i.count);
      chartRef.current.update('none');
      return;
    }

    chartRef.current = new Chart(ref.current, {
      type: 'doughnut',
      data: {
        labels:   items.map(i => i.label),
        datasets: [{ data:items.map(i=>i.count), backgroundColor:items.map(i=>colorMap[i.label]||PALETTE[0]), borderWidth:2, borderColor:'#fff', hoverOffset:6 }],
      },
      options: {
        responsive:true, maintainAspectRatio:false, cutout:'65%',
        plugins:{ legend:{ position:'bottom', labels:{font:{size:10},padding:8} }, tooltip:{ callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw}`} } },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [items]);

  return (
    <div className="flex flex-col h-full">
      {title && <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">{title}</p>}
      <div style={{ position: 'relative', height: 200 }}><canvas ref={ref} /></div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, iconBg, iconColor, loading }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className={`text-xl ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        {loading ? <div className="h-6 w-16 bg-gray-100 rounded animate-pulse mt-1" />
                 : <p className="text-xl font-bold text-gray-800 leading-tight">{value}</p>}
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user }     = useAuth();
  const router       = useRouter();
  const isSuperAdmin = user?.roleId?.isSystem === true;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const { data: statsRaw, isLoading } = useQuery({
    queryKey:        ['dashboard-stats'],
    queryFn:         () => dashboardService.getStats().then(r => r.data.data),
    refetchInterval: 5 * 60 * 1000,
    enabled:         isSuperAdmin,
  });

  if (!isSuperAdmin) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
        <LoadingSpinner />
      </div>
    );
  }

  const kpis     = statsRaw?.kpis           || {};
  const charts   = statsRaw?.charts         || {};
  const activity = statsRaw?.recentActivity || [];

  // Sprint020 PERF-007: memoize chart data to prevent destroy/recreate on every render
  const monthlyTrendData    = useMemo(() => charts.monthlyTrend,     [JSON.stringify(charts.monthlyTrend)]);
  const revByServiceData    = useMemo(() => charts.revByService,     [JSON.stringify(charts.revByService)]);
  const bookingStatusData   = useMemo(() => charts.bookingsByStatus, [JSON.stringify(charts.bookingsByStatus)]);
  const voyageStatusData    = useMemo(() => charts.voyagesByStatus,  [JSON.stringify(charts.voyagesByStatus)]);
  const invoiceStatusData   = useMemo(() => charts.invoicesByStatus, [JSON.stringify(charts.invoicesByStatus)]);

  return (
    <div className="animate-fadeIn flex flex-col gap-5">

      {/* Welcome */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">
            {greeting()}, {user?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-full">
          <MdAnchor className="w-3.5 h-3.5" />
          {user?.roleId?.name || 'Operations'}
        </span>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={GiCargoShip}    loading={isLoading} iconBg="bg-blue-50"   iconColor="text-blue-600"   label="Active Vessels"     value={fmtNum(kpis.activeVessels)}    sub={`${fmtNum(kpis.totalAgents)} active agents`} />
        <KpiCard icon={TbClockPlay}    loading={isLoading} iconBg="bg-purple-50" iconColor="text-purple-600" label="Active Rounds"      value={fmtNum(kpis.activeRounds)}     sub={`${fmtNum(kpis.plannedRounds)} planned`} />
        <KpiCard icon={FaClipboardList} loading={isLoading} iconBg="bg-teal-50"  iconColor="text-teal-600"   label="Confirmed Bookings" value={fmtNum(kpis.confirmedBookings)} sub={`${fmtNum(kpis.pendingBookings)} pending`} />
        <KpiCard icon={FaMoneyBillWave} loading={isLoading} iconBg="bg-green-50" iconColor="text-green-600"  label="Revenue (30 days)"  value={fmtMoney(kpis.revenue30d)}      sub="Confirmed bookings" />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={MdSchedule}          loading={isLoading} iconBg="bg-indigo-50" iconColor="text-indigo-600" label="Planned Rounds"   value={fmtNum(kpis.plannedRounds)}  sub={`${fmtNum(kpis.completedRounds)} completed`} />
        <KpiCard icon={MdOutlineSailing}    loading={isLoading} iconBg="bg-sky-50"    iconColor="text-sky-600"    label="Active Voyages"  value={fmtNum(kpis.activeVoyages)}  sub={`${fmtNum(kpis.totalVoyages)} total`} />
        <KpiCard icon={FaFileInvoiceDollar} loading={isLoading} iconBg="bg-amber-50"  iconColor="text-amber-600"  label="Draft Invoices"  value={fmtNum(kpis.draftInvoices)}  sub={`${fmtNum(kpis.paidInvoices)} paid`} />
        <KpiCard icon={MdWarning}           loading={isLoading} iconBg="bg-red-50"    iconColor="text-red-600"    label="Overdue Invoices" value={fmtNum(kpis.overdueInvoices)} sub="Needs attention" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Booking Trend — Last 6 Months</p>
          {isLoading ? <div className="h-56 bg-gray-50 rounded-xl animate-pulse" /> : (
            <div style={{ position:'relative', height:240 }}>
              <MonthlyTrendChart data={monthlyTrendData} />
            </div>
          )}
        </div>
        <div className="card p-5">
          {isLoading ? <div className="h-56 bg-gray-50 rounded-xl animate-pulse" /> : (
            <DoughnutChart items={bookingStatusData || []} colorMap={BOOKING_STATUS_COLORS} title="Bookings by Status" />
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Revenue by Service</p>
          {isLoading ? <div className="h-52 bg-gray-50 rounded-xl animate-pulse" />
           : !revByServiceData?.length ? <div className="flex items-center justify-center h-40 text-gray-300 text-sm">No revenue data yet</div>
           : <div style={{ position:'relative', height:220 }}><RevenueBarChart data={revByServiceData} /></div>}
        </div>
        <div className="flex flex-col gap-4">
          <div className="card p-5 flex-1">
            {isLoading ? <div className="h-40 bg-gray-50 rounded-xl animate-pulse" /> : <DoughnutChart items={voyageStatusData||[]} colorMap={VOYAGE_STATUS_COLORS} title="Voyage Status" />}
          </div>
          <div className="card p-5 flex-1">
            {isLoading ? <div className="h-40 bg-gray-50 rounded-xl animate-pulse" /> : <DoughnutChart items={invoiceStatusData||[]} colorMap={INVOICE_STATUS_COLORS} title="Invoice Status" />}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Recent Activity</p>
          <button onClick={() => router.push('/audit-logs')} className="text-xs text-teal-600 font-semibold hover:text-teal-800 transition">View all →</button>
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-3">{[1,2,3,4,5].map(i=><div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse"/>)}</div>
        ) : activity.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-gray-300 text-sm">No activity recorded yet</div>
        ) : (
          <div className="flex flex-col divide-y divide-gray-50">
            {activity.map(a => {
              const style    = ACTION_STYLES[a.action] || ACTION_STYLES.CREATE;
              const canClick = MODULE_ROUTES[a.module] && a.recordId && a.action !== 'DELETE';
              return (
                <div key={a._id}
                  onClick={() => canClick && router.push(`/audit-logs/${a._id}`)}
                  className={`flex items-center gap-3 py-2.5 ${canClick ? 'cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg transition' : ''}`}
                >
                  <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: style.bg, color: style.color }}>{style.label}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-700 capitalize">{a.module}</span>
                    {a.recordNumber && <span className="mono text-xs text-teal-600 ml-1.5 font-semibold">{a.recordNumber}</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <MdPersonOutline className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-400 max-w-[100px] truncate">{a.user}</span>
                  </div>
                  <span className="text-[10px] text-gray-300 flex-shrink-0 w-14 text-right">{relativeTime(a.timestamp)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
