'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FaMoneyBillWave } from 'react-icons/fa';
import { dashboardService } from '@/services/dashboard.service';
import { reportsService }   from '@/services/reports.service';
import { useDashboardFilters } from '../DashboardFilterContext';
import { KpiCard, WidgetCard, WidgetEmptyState, WidgetSkeleton, fmtMoney } from './WidgetPrimitives';
import { MonthlyTrendChart, RevenueBarChart } from './ChartPrimitives';

// Sprint 039 — Commercial widgets. Total Revenue / Revenue This Month
// call reports.service.js#getRevenueReport directly (ADR-5 — the same
// endpoint Revenue Report itself uses, Layer 2 + Final Loading only,
// Sprint 038's final rule), so they stay filter-responsive to the
// Global Filter Bar's Service/Date Range. Revenue Trend / Revenue by
// Service reuse GET /dashboard/stats's own monthlyTrend/revByService,
// which Sprint 039 already corrected to the identical Final-Loading
// rule (Section 3.1/ADR-2) — no second, parallel aggregation is added
// for the same figure.

export function TotalRevenueWidget() {
  const router = useRouter();
  const { serviceId, dateFrom, dateTo } = useDashboardFilters();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-revenue', serviceId, dateFrom, dateTo],
    queryFn:  () => reportsService.getRevenueReport({ serviceId, dateFrom, dateTo }).then(r => r.data.data),
  });
  const grandTotal = data?.grandTotal || {};
  return (
    <KpiCard
      icon={FaMoneyBillWave} loading={isLoading}
      iconBg="bg-green-50" iconColor="text-green-600"
      label={dateFrom || dateTo ? 'Revenue (filtered)' : 'Total Revenue'}
      value={fmtMoney(grandTotal.totalRevenue)}
      sub="Layer 2 · Final Loading only"
      onClick={() => router.push('/reports/revenue')}
    />
  );
}

export function RevenueTrendWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['dash-stats-tier1'],
    queryFn:  () => dashboardService.getStats().then(r => r.data.data),
  });
  const monthlyTrend = data?.charts?.monthlyTrend;
  return (
    <WidgetCard title="Revenue Trend — Last 6 Months">
      {isLoading ? <WidgetSkeleton rows={1} height={240} /> : (
        <div style={{ position: 'relative', height: 240 }}>
          <MonthlyTrendChart data={monthlyTrend} />
        </div>
      )}
    </WidgetCard>
  );
}

export function RevenueByServiceWidget() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-stats-tier1'],
    queryFn:  () => dashboardService.getStats().then(r => r.data.data),
  });
  const revByService = data?.charts?.revByService || [];
  return (
    <WidgetCard title="Revenue by Service" action={<button onClick={() => router.push('/reports/revenue')} className="text-xs text-teal-600 font-semibold hover:text-teal-800 transition">View report →</button>}>
      {isLoading ? <WidgetSkeleton rows={1} height={220} />
       : revByService.length === 0 ? <WidgetEmptyState message="No Final Loading revenue recorded yet." />
       : <div style={{ position: 'relative', height: 220 }}><RevenueBarChart data={revByService} /></div>}
    </WidgetCard>
  );
}
