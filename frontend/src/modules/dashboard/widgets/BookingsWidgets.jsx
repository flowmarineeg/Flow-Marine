'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FaClipboardList } from 'react-icons/fa';
import { dashboardService } from '@/services/dashboard.service';
import { KpiCard, WidgetCard, fmtNum } from './WidgetPrimitives';
import { DoughnutChart } from './ChartPrimitives';

const BOOKING_STATUS_COLORS = { Confirmed:'#0D9488', Pending:'#F59E0B', 'Final Loading':'#3B82F6', Cancelled:'#F87171' };

// Sprint 039 — Bookings section reuses GET /dashboard/stats's existing
// Tier 1 counts (both layers already counted separately there since
// Sprint 023) — status is a field read, not a business rule, so no
// report call is needed for these (Section 3.7 Tier 1).

export function BookingCountsWidget() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-stats-tier1'],
    queryFn:  () => dashboardService.getStats().then(r => r.data.data),
  });
  const kpis = data?.kpis || {};
  const bookingsByStatus = data?.charts?.bookingsByStatus || [];
  const finalLoading = bookingsByStatus.find(s => s.label === 'Final Loading')?.count ?? 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <KpiCard icon={FaClipboardList} loading={isLoading} iconBg="bg-purple-50" iconColor="text-purple-600"
        label="Layer 1 Bookings" value={fmtNum(kpis.totalManualBookings)}
        onClick={() => router.push('/reports/bookings?layer=Manual')} />
      <KpiCard icon={FaClipboardList} loading={isLoading} iconBg="bg-blue-50" iconColor="text-blue-600"
        label="Layer 2 Bookings" value={fmtNum(kpis.totalBookings)}
        onClick={() => router.push('/reports/bookings?layer=Operational')} />
      <KpiCard icon={FaClipboardList} loading={isLoading} iconBg="bg-teal-50" iconColor="text-teal-600"
        label="Final Loading" value={fmtNum(finalLoading)}
        onClick={() => router.push('/reports/bookings?status=Final Loading')} />
      <KpiCard icon={FaClipboardList} loading={isLoading} iconBg="bg-amber-50" iconColor="text-amber-600"
        label="Pending" value={fmtNum((kpis.pendingBookings ?? 0) + (kpis.pendingManualBookings ?? 0))}
        onClick={() => router.push('/reports/bookings?status=Pending')} />
      <KpiCard icon={FaClipboardList} loading={isLoading} iconBg="bg-indigo-50" iconColor="text-indigo-600"
        label="Confirmed" value={fmtNum((kpis.confirmedBookings ?? 0) + (kpis.confirmedManualBookings ?? 0))}
        onClick={() => router.push('/reports/bookings?status=Confirmed')} />
    </div>
  );
}

export function BookingStatusChartWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dash-stats-tier1'],
    queryFn:  () => dashboardService.getStats().then(r => r.data.data),
  });
  const bookingsByStatus = data?.charts?.bookingsByStatus || [];
  return (
    <WidgetCard title="Bookings by Status (Layer 2)">
      {isLoading ? <div className="h-52 bg-gray-50 rounded-xl animate-pulse" /> : (
        <DoughnutChart items={bookingsByStatus} colorMap={BOOKING_STATUS_COLORS} />
      )}
    </WidgetCard>
  );
}
