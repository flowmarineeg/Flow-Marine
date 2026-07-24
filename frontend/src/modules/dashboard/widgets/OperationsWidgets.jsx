'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { TbClockPlay } from 'react-icons/tb';
import { MdOutlineSailing } from 'react-icons/md';
import { dashboardService } from '@/services/dashboard.service';
import { KpiCard, WidgetCard, WidgetEmptyState, fmtNum } from './WidgetPrimitives';

// Sprint 039 — each widget owns its own useQuery (Refinement 4): a slow
// or empty widget never blocks its siblings.

export function ActiveRoundsWidget() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-stats-tier1'],
    queryFn:  () => dashboardService.getStats().then(r => r.data.data),
  });
  const kpis = data?.kpis || {};
  return (
    <KpiCard
      icon={TbClockPlay} loading={isLoading}
      iconBg="bg-purple-50" iconColor="text-purple-600"
      label="Active Rounds" value={fmtNum(kpis.activeRounds)}
      sub={`${fmtNum(kpis.plannedRounds)} planned · ${fmtNum(kpis.completedRounds)} completed`}
      onClick={() => router.push('/rounds?status=Active')}
    />
  );
}

export function ActiveVoyagesWidget() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-stats-tier1'],
    queryFn:  () => dashboardService.getStats().then(r => r.data.data),
  });
  const kpis = data?.kpis || {};
  return (
    <KpiCard
      icon={MdOutlineSailing} loading={isLoading}
      iconBg="bg-sky-50" iconColor="text-sky-600"
      label="Active Voyages" value={fmtNum(kpis.activeVoyages)}
      sub={`${fmtNum(kpis.totalVoyages)} total`}
      onClick={() => router.push('/voyages')}
    />
  );
}

// Vessel Utilisation / Capacity Utilisation / Overbooked / Available
// Capacity — all four Operations KPIs share one fetch of
// GET /dashboard/fleet-utilisation (Section 5.1), which already calls
// capacity.service.js#computeRoundCapacity per Active round.
export function FleetUtilisationWidget() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-fleet-utilisation'],
    queryFn:  () => dashboardService.getFleetUtilisation().then(r => r.data.data),
    refetchInterval: 60 * 1000, // matches capacity engine's own 60s cache
  });
  const items = data?.items || [];

  const totalAvailable = items.reduce((s, i) => s + Math.max(0, (i.vesselCapacity ?? 0) - (i.peakOnboardTEU ?? 0)), 0);
  const overbookedCount = items.filter(i => i.color === 'red').length;
  const avgUtil = items.length
    ? Math.round(items.reduce((s, i) => s + (i.peakPct ?? 0), 0) / items.length)
    : null;

  return (
    <WidgetCard title="Fleet Utilisation — Active Rounds" action={<span className="text-[10px] text-gray-400">{items.length} active round{items.length !== 1 ? 's' : ''}</span>}>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <WidgetEmptyState message="No Active rounds right now." />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Avg Utilisation</p>
              <p className="text-lg font-bold text-gray-800">{avgUtil != null ? `${avgUtil}%` : '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Available Capacity</p>
              <p className="text-lg font-bold text-gray-800">{fmtNum(totalAvailable)} TEU</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Overbooked Voyages</p>
              <p className={`text-lg font-bold ${overbookedCount > 0 ? 'text-red-600' : 'text-gray-800'}`}>{overbookedCount}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Active Rounds</p>
              <p className="text-lg font-bold text-gray-800">{items.length}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map(item => {
              const colorClasses = {
                red:   { bar: 'bg-red-500',   text: 'text-red-600',   bg: 'bg-red-50',   border: 'border-red-200' },
                amber: { bar: 'bg-amber-400', text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
                green: { bar: 'bg-teal-500',  text: 'text-teal-600',  bg: 'bg-teal-50',  border: 'border-teal-200' },
                gray:  { bar: 'bg-gray-300',  text: 'text-gray-500',  bg: 'bg-gray-50',  border: 'border-gray-200' },
              }[item.color] || { bar: 'bg-gray-300', text: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' };
              const pct = Math.min(item.peakPct ?? 0, 100);
              return (
                <div
                  key={item.roundId}
                  className={`rounded-xl border ${colorClasses.border} ${colorClasses.bg} p-4 cursor-pointer hover:shadow-sm transition`}
                  onClick={() => router.push(`/reports/round-capacity?roundId=${item.roundId}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-gray-700 truncate">{item.vesselCode}</p>
                      <p className="text-[10px] text-gray-400 truncate">{item.vesselName}</p>
                    </div>
                    <span className={`text-[11px] font-bold ml-2 flex-shrink-0 ${colorClasses.text}`}>
                      {item.peakPct != null ? `${item.peakPct}%` : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/80 rounded-full overflow-hidden mb-2">
                    <div className={`h-full rounded-full transition-all ${colorClasses.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span className="mono font-semibold">{item.roundNumber}</span>
                    <span>{item.serviceCode}</span>
                    <span>
                      {fmtNum(item.peakOnboardTEU)}
                      {item.vesselCapacity ? ` / ${fmtNum(item.vesselCapacity)} TEU` : ' TEU'}
                    </span>
                  </div>
                  {item.warningCount > 0 && (
                    <p className="mt-1.5 text-[10px] font-semibold text-amber-600">
                      ⚠️ {item.warningCount} warning{item.warningCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </WidgetCard>
  );
}
