'use client';

import { useState } from 'react';
import { useQuery }  from '@tanstack/react-query';
import ReportLayout  from './ReportLayout';
import { ReportStatCard, ReportEmptyState } from './reportHelpers';
import { reportsService } from '@/services/reports.service';
import { roundsService }  from '@/services/rounds.service';
import CapacityTimeline     from '@/modules/vessels/components/CapacityTimeline';
import CapacityWarnings     from '@/modules/vessels/components/CapacityWarnings';
import VoyageCapacityCard   from './VoyageCapacityCard';

const fmt = (n) => (n ?? 0).toLocaleString();

const UTIL_COLOR = (pct) =>
  pct == null  ? 'text-gray-400'
  : pct >= 100 ? 'text-red-600 font-bold'
  : pct >= 90  ? 'text-red-500 font-semibold'
  : pct >= 70  ? 'text-amber-600 font-semibold'
  : 'text-green-600';

export default function RoundCapacityReport() {
  const [roundId,       setRoundId]       = useState('');
  const [includePending, setIncludePending] = useState(false);

  // Round picker list — all rounds, sorted by startDate desc
  const { data: roundsData } = useQuery({
    queryKey: ['rounds-list-for-cap'],
    queryFn:  () => roundsService.list({ limit: 200 }).then(r => r.data.data?.data || []),
  });

  // Capacity report — fires when roundId is selected
  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ['round-capacity-report', roundId, includePending],
    queryFn:  () => reportsService.getRoundCapacityReport({
      roundId,
      statuses: includePending
        ? 'Confirmed,Final Loading,Pending'
        : undefined,
    }).then(r => r.data.data),
    enabled: !!roundId,
  });

  const rounds = roundsData || [];

  return (
    <ReportLayout
      title="Round Capacity Report"
      subtitle="Operational vessel timeline — one card per voyage in chronological order"
      filters={
        <div className="flex flex-wrap items-end gap-3">
          {/* Round selector */}
          <div className="flex flex-col gap-1 min-w-[240px]">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Round</label>
            <select
              value={roundId}
              onChange={e => setRoundId(e.target.value)}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer"
            >
              <option value="">Select a round...</option>
              {rounds.map(r => (
                <option key={r._id} value={r._id}>
                  {r.roundNumber} ({r.roundName || 'unnamed'}) — {r.serviceId?.serviceCode || 'No service'} ({r.status})
                </option>
              ))}
            </select>
          </div>

          {/* Include pending toggle */}
          <div className="flex items-center gap-2 pb-1">
            <input
              id="include-pending"
              type="checkbox"
              checked={includePending}
              onChange={e => setIncludePending(e.target.checked)}
              className="w-4 h-4 accent-teal-600 cursor-pointer"
            />
            <label htmlFor="include-pending" className="text-[12px] font-medium text-gray-600 cursor-pointer">
              Include Pending bookings
            </label>
          </div>
        </div>
      }
      summary={
        raw ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ReportStatCard
              label="Peak Onboard"
              value={`${fmt(raw.totals?.peakOnboardTEU)} TEU`}
              sub={(() => {
                const pv = raw.voyages?.find(v => String(v.voyageId) === String(raw.totals?.peakVoyageId));
                return pv ? `Voyage ${pv.voyageNumber} (${pv.voyageName || 'unnamed'})` : 'Voyage —';
              })()}
              accent
            />
            <ReportStatCard
              label="Total Loaded TEU"
              value={`${fmt(raw.totals?.totalLoadedTEU)} TEU`}
              sub={`${fmt(raw.totals?.totalBookedUnits)} containers`}
            />
            <ReportStatCard
              label="Vessel Capacity"
              value={raw.vessel?.capacity ? `${fmt(raw.vessel.capacity)} TEU` : '—'}
              sub={raw.vessel?.vesselName}
            />
            <ReportStatCard
              label="Avg Utilisation"
              value={raw.totals?.avgUtilisationPct != null ? `${raw.totals.avgUtilisationPct}%` : '—'}
              sub={`${raw.voyages?.length ?? 0} voyages`}
            />
          </div>
        ) : null
      }
    >
      {!roundId && (
        <ReportEmptyState message="Select a round above to generate the per-leg capacity report." />
      )}

      {roundId && isLoading && (
        <div className="card flex items-center justify-center py-16 text-gray-400 text-sm">
          Computing capacity...
        </div>
      )}

      {roundId && isError && (
        <div className="card flex items-center justify-center py-16 text-red-400 text-sm">
          Failed to load capacity data. Check that the round has a valid route and vessel.
        </div>
      )}

      {raw && (
        <div className="flex flex-col gap-5">
          {/* Round + vessel metadata */}
          <div className="card p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
            {[
              { label: 'Round',    val: raw.round?.roundNumber ? `${raw.round.roundNumber} (${raw.round.roundName || 'unnamed'})` : '—' },
              { label: 'Service',  val: raw.service?.serviceCode + (raw.service?.serviceName ? ` — ${raw.service.serviceName}` : '') },
              { label: 'Vessel',   val: raw.vessel?.vesselCode + (raw.vessel?.vesselName ? ` / ${raw.vessel.vesselName}` : '') },
              { label: 'Status',   val: raw.round?.status },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="font-semibold text-gray-700">{val || '—'}</p>
              </div>
            ))}
          </div>

          {/* Timeline chart */}
          {raw.voyages?.length > 0 && (
            <div className="card p-5">
              <CapacityTimeline voyages={raw.voyages} vesselCapacity={raw.vessel?.capacity} />
            </div>
          )}

          {/* Sprint 038 — one full-width operational card per voyage,
              chronological order (raw.voyages is already sorted by
              sequence by capacity.service.js). */}
          {raw.voyages?.length > 0 ? (
            <div className="flex flex-col gap-4">
              {raw.voyages.map(v => (
                <VoyageCapacityCard
                  key={String(v.voyageId)}
                  voyage={v}
                  vesselName={raw.vessel?.vesselName}
                  vesselCapacity={raw.vessel?.capacity}
                  warnings={raw.warnings}
                />
              ))}
            </div>
          ) : (
            <ReportEmptyState message="No bookings found for this round with the selected statuses." />
          )}

          {/* Round/booking-level warnings only — voyage-level warnings
              (those carrying a voyageId) already render inline on their
              own card above (Sprint 038 refinement 3), so they are
              excluded here to avoid showing the same warning twice. */}
          {raw.warnings?.filter(w => !w.voyageId).length > 0 && (
            <div className="card p-5">
              <CapacityWarnings warnings={raw.warnings.filter(w => !w.voyageId)} />
            </div>
          )}
        </div>
      )}
    </ReportLayout>
  );
}
