'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { reportsService } from '@/services/reports.service';
import { useDashboardFilters } from '../DashboardFilterContext';
import { WidgetCard, WidgetEmptyState, WidgetSkeleton, fmtMoney } from './WidgetPrimitives';
import { getVoyageLabel } from '@/utils/voyageLabel';

// Sprint 039 — every Performance widget re-groups rows an existing
// report endpoint already returns; none re-implements Booking Revenue
// Details' pricing-group logic or Voyage Profitability's calculations.

// Post-audit note (system-audit-2026-8-3.md §3.6): unlike
// VoyageLeaderboardWidget below (which needs one specific Round to rank),
// these two widgets are deliberately fleet-wide-by-default — "Top Agents/
// Routes by Revenue" is meant to answer that question with no filter
// applied, so they intentionally do NOT get an `enabled: !!someFilter`
// gate (that would remove their whole no-filter default view). The real
// cost concern — an expensive, slow-changing aggregate refetching on
// every dashboard mount — is addressed with a long `staleTime` instead:
// this data doesn't need to be recomputed more than once every few
// minutes for a "top performers" ranking to stay useful.
const TOP_PERFORMER_STALE_TIME = 5 * 60 * 1000;

export function TopAgentsWidget() {
  const router = useRouter();
  const { roundId, voyageId, agentId, dateFrom, dateTo } = useDashboardFilters();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-booking-revenue-details', roundId, voyageId, agentId, dateFrom, dateTo],
    queryFn:  () => reportsService.getBookingRevenueDetails({ roundId, voyageId, agentId, dateFrom, dateTo }).then(r => r.data.data),
    staleTime: TOP_PERFORMER_STALE_TIME,
  });
  const rows = useMemo(() => data?.rows || [], [data]);

  const topAgents = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      const key = r.agentId || r.agentName || 'unknown';
      if (!map.has(key)) map.set(key, { agentName: r.agentName || 'Unknown', totalRevenue: 0 });
      map.get(key).totalRevenue += r.totalRevenue;
    });
    return [...map.values()].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
  }, [rows]);

  return (
    <WidgetCard title="Top Agents by Revenue" action={<button onClick={() => router.push('/reports/booking-revenue-details')} className="text-xs text-teal-600 font-semibold hover:text-teal-800 transition">View report →</button>}>
      {isLoading ? <WidgetSkeleton rows={4} height={28} />
       : topAgents.length === 0 ? <WidgetEmptyState message="No Final Loading bookings for the current filters." />
       : (
        <div className="flex flex-col gap-2">
          {topAgents.map((a, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-gray-600 truncate max-w-[60%]">{i + 1}. {a.agentName}</span>
              <span className="mono font-semibold text-teal-700">{fmtMoney(a.totalRevenue)}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

export function TopRoutesWidget() {
  const router = useRouter();
  const { roundId, voyageId, agentId, dateFrom, dateTo } = useDashboardFilters();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-booking-revenue-details', roundId, voyageId, agentId, dateFrom, dateTo],
    queryFn:  () => reportsService.getBookingRevenueDetails({ roundId, voyageId, agentId, dateFrom, dateTo }).then(r => r.data.data),
    staleTime: TOP_PERFORMER_STALE_TIME,
  });
  const rows = useMemo(() => data?.rows || [], [data]);

  const topRoutes = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      const key = `${r.polName}__${r.podName}`;
      if (!map.has(key)) map.set(key, { polName: r.polName, podName: r.podName, totalRevenue: 0 });
      map.get(key).totalRevenue += r.totalRevenue;
    });
    return [...map.values()].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
  }, [rows]);

  return (
    <WidgetCard title="Top Routes by Revenue" action={<button onClick={() => router.push('/reports/booking-revenue-details')} className="text-xs text-teal-600 font-semibold hover:text-teal-800 transition">View report →</button>}>
      {isLoading ? <WidgetSkeleton rows={4} height={28} />
       : topRoutes.length === 0 ? <WidgetEmptyState message="No Final Loading bookings for the current filters." />
       : (
        <div className="flex flex-col gap-2">
          {topRoutes.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-gray-600 truncate max-w-[60%]">{i + 1}. {r.polName || '—'} → {r.podName || '—'}</span>
              <span className="mono font-semibold text-teal-700">{fmtMoney(r.totalRevenue)}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

export function VoyageLeaderboardWidget() {
  const router = useRouter();
  const { roundId } = useDashboardFilters();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-round-pnl-leaderboard', roundId],
    queryFn:  () => reportsService.getRoundPnL({ roundId }).then(r => r.data.data),
    enabled:  !!roundId,
  });
  const voyages = useMemo(() => data?.voyages || [], [data]);

  const ranked = useMemo(() => {
    return [...voyages]
      .map(v => ({ ...v, netProfit: v.revenue.totalRevenue - v.voyageCost.total }))
      .sort((a, b) => b.netProfit - a.netProfit);
  }, [voyages]);
  const best   = ranked.slice(0, 3);
  const lowest = [...ranked].reverse().slice(0, 3);

  return (
    <WidgetCard title="Best / Lowest Performing Voyages" action={roundId && <button onClick={() => router.push(`/reports/round-pnl?roundId=${roundId}`)} className="text-xs text-teal-600 font-semibold hover:text-teal-800 transition">View report →</button>}>
      {!roundId ? (
        <WidgetEmptyState message="Select a Round in the filter bar above to rank its voyages by Net Profit." />
      ) : isLoading ? (
        <WidgetSkeleton rows={3} height={28} />
      ) : ranked.length === 0 ? (
        <WidgetEmptyState message="No voyages with Final Loading revenue in this round yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-2">Best</p>
            <div className="flex flex-col gap-1.5">
              {best.map(v => (
                <div key={v.voyageId} className="flex items-center justify-between text-xs">
                  <span className="mono text-gray-600">{getVoyageLabel(v)}</span>
                  <span className="font-semibold text-teal-700">{fmtMoney(v.netProfit)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">Lowest</p>
            <div className="flex flex-col gap-1.5">
              {lowest.map(v => (
                <div key={v.voyageId} className="flex items-center justify-between text-xs">
                  <span className="mono text-gray-600">{getVoyageLabel(v)}</span>
                  <span className={`font-semibold ${v.netProfit < 0 ? 'text-red-600' : 'text-gray-700'}`}>{fmtMoney(v.netProfit)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
