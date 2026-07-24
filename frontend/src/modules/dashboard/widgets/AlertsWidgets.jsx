'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MdPersonOutline } from 'react-icons/md';
import { dashboardService } from '@/services/dashboard.service';
import { WidgetCard, WidgetEmptyState, WidgetSkeleton } from './WidgetPrimitives';

// Sprint 039 — every Alerts widget reads warnings/utilisation data that
// GET /dashboard/fleet-utilisation already fetches from
// capacity.service.js (Section 5.6) — no new capacity computation.

const ICONS = { VOYAGE_OVERBOOKED: '🔴' };
const NEAR_CAPACITY_THRESHOLD = 90;

export function CapacityWarningsWidget() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-fleet-utilisation'],
    queryFn:  () => dashboardService.getFleetUtilisation().then(r => r.data.data),
    refetchInterval: 60 * 1000,
  });
  const items = useMemo(() => data?.items || [], [data]);

  const allWarnings = useMemo(() => (
    items.flatMap(item => (item.warnings || []).map(w => ({ ...w, roundId: item.roundId, roundNumber: item.roundNumber })))
  ), [items]);

  const nearCapacity = useMemo(() => (
    items.flatMap(item => (item.voyages || [])
      .filter(v => v.utilisationPct != null && v.utilisationPct >= NEAR_CAPACITY_THRESHOLD && v.utilisationPct < 100)
      .map(v => ({ ...v, roundId: item.roundId, roundNumber: item.roundNumber })))
  ), [items]);

  return (
    <WidgetCard title="Capacity Warnings">
      {isLoading ? <WidgetSkeleton rows={3} height={32} />
       : (allWarnings.length === 0 && nearCapacity.length === 0) ? <WidgetEmptyState message="No capacity warnings right now." />
       : (
        <div className="flex flex-col gap-2">
          {allWarnings.map((w, i) => (
            <div
              key={`w-${i}`}
              onClick={() => router.push(`/reports/round-capacity?roundId=${w.roundId}`)}
              className="flex items-start gap-2 text-xs text-red-700 cursor-pointer hover:bg-red-50/50 -mx-2 px-2 py-1 rounded-lg transition"
            >
              <span className="flex-shrink-0">{ICONS[w.code] || '⚠️'}</span>
              <span>{w.message}</span>
            </div>
          ))}
          {nearCapacity.map((v, i) => (
            <div
              key={`n-${i}`}
              onClick={() => router.push(`/reports/round-capacity?roundId=${v.roundId}`)}
              className="flex items-start gap-2 text-xs text-amber-700 cursor-pointer hover:bg-amber-50/50 -mx-2 px-2 py-1 rounded-lg transition"
            >
              <span className="flex-shrink-0">🟡</span>
              <span>Voyage {v.voyageNumber} ({v.roundNumber}) is at {v.utilisationPct}% utilisation — near capacity</span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

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
const relativeTime = (ts) => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export function OperationalWarningsWidget() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['dash-stats-tier1'],
    queryFn:  () => dashboardService.getStats().then(r => r.data.data),
  });
  const activity = data?.recentActivity || [];

  return (
    <WidgetCard title="Recent Activity" action={<button onClick={() => router.push('/audit-logs')} className="text-xs text-teal-600 font-semibold hover:text-teal-800 transition">View all →</button>}>
      {isLoading ? <WidgetSkeleton rows={5} height={40} />
       : activity.length === 0 ? <WidgetEmptyState message="No activity recorded yet." />
       : (
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
    </WidgetCard>
  );
}
