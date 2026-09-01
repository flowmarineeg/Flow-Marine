'use client';

/**
 * CapacityTimeline — Sprint 023 revision
 *
 * Visualizes cargo flow through the connected voyage chain.
 * Each port is shown once. The onboard TEU between ports is shown as a
 * proportional filled bar, so planners see how capacity evolves continuously:
 *
 *  [P1]──────────────[P2]──────────[P3]────────────────[P4]
 *    +20 load         -5 off         +8 load, -4 off
 *    ████████░░░░     ███████░░░░░   ████████████░░░░
 *    20/140 TEU       15/140 TEU     19/140 TEU
 *
 * The ending onboard of voyage N is the starting onboard of voyage N+1.
 */

import { getVoyageLabel } from '@/utils/voyageLabel';

const barColor = (pct) => {
  if (pct == null)  return 'bg-gray-200';
  if (pct >= 100)   return 'bg-red-500';
  if (pct >= 90)    return 'bg-orange-400';
  if (pct >= 70)    return 'bg-amber-400';
  return 'bg-teal-500';
};

const textColor = (pct) => {
  if (pct == null) return 'text-gray-400';
  if (pct >= 100)  return 'text-red-600';
  if (pct >= 90)   return 'text-orange-500';
  if (pct >= 70)   return 'text-amber-600';
  return 'text-teal-600';
};

const fmt = (n) => n == null ? '—' : Number(n).toLocaleString();

export default function CapacityTimeline({ voyages = [], vesselCapacity = null }) {
  if (!voyages?.length) return null;

  // Build the port chain: ordered list of unique ports from the voyage sequence.
  // Each adjacent pair of ports has a "leg" (voyage between them).
  // Port entry: { portId, name, code, loadedTEU, dischargedTEU, isFirst, isLast }
  // Leg entry:  { voyageId, voyageNumber, onboardTEU, utilisationPct }

  const ports = [];
  const legs  = [];

  // Add the first port of the first voyage
  const firstVoyage = voyages[0];
  ports.push({
    portId:        firstVoyage.fromPort.portId,
    name:          firstVoyage.fromPort.name,
    code:          firstVoyage.fromPort.code,
    loadedTEU:     firstVoyage.loadedTEU,
    dischargedTEU: 0,  // nothing discharged at the very start
  });

  for (let i = 0; i < voyages.length; i++) {
    const v = voyages[i];

    // The transit leg
    legs.push({
      voyageId:     v.voyageId,
      voyageNumber: v.voyageNumber,
      voyageName:   v.voyageName || null,
      onboardTEU:   v.onboardTEU,
      utilisationPct: v.utilisationPct,
      isManual:     v.isManual,
      // Sprint 045 — presentation-only flag, does not affect onboardTEU/bar width above.
      remainingOnboardTEU: v.remainingOnboardTEU || 0,
    });

    // The arrival port of this voyage = departure port of next voyage
    // Discharge at this port is this voyage's dischargedTEU.
    // Load at this port is next voyage's loadedTEU (if it exists).
    const nextVoyage  = voyages[i + 1];
    const loadedNext  = nextVoyage?.loadedTEU ?? 0;
    const dischHere   = v.dischargedTEU;

    ports.push({
      portId:        v.toPort.portId,
      name:          v.toPort.name,
      code:          v.toPort.code,
      loadedTEU:     loadedNext,   // loaded here = next voyage's load
      dischargedTEU: dischHere,    // discharged here = this voyage's discharge
      onboardAfter:  v.onboardTEU, // onboard after leaving this port
    });
  }

  const peak = Math.max(...voyages.map(v => v.onboardTEU), vesselCapacity || 0, 1);

  return (
    <div className="w-full">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Cargo Flow Timeline
      </p>

      {/* Timeline */}
      <div className="flex flex-wrap items-stretch w-full gap-0 min-w-0">

        {ports.map((port, pIdx) => {
          const leg       = legs[pIdx]; // leg AFTER this port (undefined for last port)
          const isLast    = pIdx === ports.length - 1;
          const hasLoad   = port.loadedTEU > 0;
          const hasDisch  = port.dischargedTEU > 0;

          return (
            <div key={`${port.portId}-${pIdx}`} className="flex items-stretch min-w-0">

              {/* Port column */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 56 }}>
                {/* Port activity badge */}
                <div className="flex flex-col items-center gap-0.5 mb-1.5 min-h-[40px] justify-end">
                  {hasDisch && (
                    <span className="text-[10px] font-semibold text-orange-500 whitespace-nowrap">
                      −{fmt(port.dischargedTEU)}
                    </span>
                  )}
                  {hasLoad && (
                    <span className="text-[10px] font-semibold text-blue-500 whitespace-nowrap">
                      +{fmt(port.loadedTEU)}
                    </span>
                  )}
                </div>

                {/* Port dot */}
                <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 z-10 ${
                  (hasLoad || hasDisch)
                    ? 'border-teal-500 bg-white'
                    : 'border-gray-300 bg-white'
                }`} />

                {/* Port name below dot */}
                <div className="mt-1.5 text-center">
                  <p className="text-[10px] font-bold text-gray-600 whitespace-nowrap">
                    {port.code || port.name}
                  </p>
                  {port.code && port.name && port.name !== port.code && (
                    <p className="text-[9px] text-gray-400 whitespace-nowrap max-w-[56px] truncate">{port.name}</p>
                  )}
                </div>
              </div>

              {/* Leg bar between this port and the next */}
              {!isLast && leg && (
                <div className="flex flex-col justify-center flex-1 min-w-[48px] px-1 relative" style={{ marginTop: '-8px' }}>
                  {/* The leg bar at port-dot level */}
                  <div className="flex flex-col gap-1" style={{ marginTop: '20px' }}>
                    {/* TEU bar */}
                    <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor(leg.utilisationPct)}`}
                        style={{ width: `${Math.min((leg.onboardTEU / peak) * 100, 100)}%` }}
                      />
                    </div>

                    {/* Voyage label + TEU under bar */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] text-gray-400 mono truncate">{getVoyageLabel(leg)}</span>
                      <span className={`text-[10px] font-bold whitespace-nowrap ${textColor(leg.utilisationPct)}`}>
                        {fmt(leg.onboardTEU)}
                        <span className="text-[8px] font-normal text-gray-400 ml-0.5">TEU</span>
                      </span>
                    </div>

                    {/* Sprint 045 — operational warning: TEU expected to discharge
                        on this voyage but not found by a Discharge import */}
                    {leg.remainingOnboardTEU > 0 && (
                      <p className="text-[9px] font-semibold text-red-600 text-right whitespace-nowrap">
                        ⚠ {fmt(leg.remainingOnboardTEU)} TEU remaining
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Capacity reference line */}
      {vesselCapacity && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
          <div className="w-6 h-px border-t-2 border-dashed border-gray-300 flex-shrink-0" />
          <span className="text-[10px] text-gray-400">
            Vessel capacity: <strong>{vesselCapacity.toLocaleString()} TEU</strong>
          </span>
          <span className="text-gray-200 mx-1">·</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className="w-2 h-2 rounded-sm bg-teal-500 flex-shrink-0" /> &lt;70%
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className="w-2 h-2 rounded-sm bg-amber-400 flex-shrink-0" /> 70–90%
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className="w-2 h-2 rounded-sm bg-orange-400 flex-shrink-0" /> 90–100%
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <span className="w-2 h-2 rounded-sm bg-red-500 flex-shrink-0" /> &gt;100%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
