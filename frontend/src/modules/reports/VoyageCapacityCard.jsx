'use client';

/**
 * VoyageCapacityCard — Sprint 038
 *
 * One full-width operational card per voyage for the Round Capacity
 * Report. Consumes capacity.service.js#computeRoundCapacity's existing
 * per-voyage payload unchanged, plus the one additive field this sprint
 * adds (capacityBeforeLoading). No calculation happens in this
 * component — every figure is read directly from the engine's own
 * output.
 */

import { getVoyageLabel } from '@/utils/voyageLabel';

const fmt = (n) => n == null ? '—' : Number(n).toLocaleString();

const ICONS = {
  VOYAGE_OVERBOOKED: '🔴',
  REMAINING_ONBOARD_PAST_DISCHARGE: '🔴',
};

function Stat({ label, value, sub, accent, danger }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${danger ? 'text-red-600' : accent ? 'text-teal-700' : 'text-gray-700'}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function VoyageCapacityCard({ voyage: v, vesselName, vesselCapacity, warnings = [] }) {
  const isOverbooked = v.remainingTEU != null && v.remainingTEU < 0;
  // Sprint 045 — TEU expected to discharge at this voyage but still
  // physically onboard (Discharge import found it "Remaining"). Purely a
  // presentation flag — never affects onboardTEU/remainingTEU above.
  const hasRemaining = (v.remainingOnboardTEU || 0) > 0;
  // Sprint 038 refinement 3 — voyage-scoped warnings render inline on
  // their own card; warnings with no voyageId (round/booking-level) are
  // left to the shared CapacityWarnings block instead.
  const ownWarnings = warnings.filter(w => w.voyageId && String(w.voyageId) === String(v.voyageId));

  return (
    <div className={`card p-5 border-2 ${isOverbooked || hasRemaining ? 'border-red-300 bg-red-50/30' : 'border-transparent'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="mono text-sm font-bold text-teal-700">{getVoyageLabel(v)}</span>
          {v.isManual && <span className="text-[10px] font-semibold text-amber-500 uppercase">Manual</span>}
          <span className="text-xs text-gray-500">
            {v.fromPort?.name || v.fromPort?.code || '—'}
            <span className="text-gray-300 mx-1.5">→</span>
            {v.toPort?.name || v.toPort?.code || '—'}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          {vesselName} {vesselCapacity != null && `· ${fmt(vesselCapacity)} TEU capacity`}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        <Stat label="Vessel Name" value={vesselName || '—'} />
        <Stat label="Vessel Capacity (TEU)" value={vesselCapacity != null ? fmt(vesselCapacity) : '—'} />
        <Stat label="Capacity Before Loading" value={v.capacityBeforeLoading != null ? `${fmt(v.capacityBeforeLoading)} TEU` : '—'} />
        <Stat label="Loaded TEU" value={`+${fmt(v.loadedTEU)}`} accent />
        <Stat label="Discharged TEU" value={`−${fmt(v.dischargedTEU)}`} />
        <Stat label="Peak Onboard" value={`${fmt(v.onboardTEU)} TEU`} sub="fullest leg of the run" />
        <Stat
          label="Remaining at Peak"
          value={v.remainingTEU != null ? `${fmt(v.remainingTEU)} TEU` : '—'}
          danger={isOverbooked}
        />
        <Stat
          label="Utilization %"
          value={v.utilisationPct != null ? `${v.utilisationPct}%` : '—'}
          danger={v.utilisationPct != null && v.utilisationPct >= 100}
        />
        <Stat label="Layer 1 Loaded" value={`+${fmt(v.layer1?.loadedTEU)}`} />
        <Stat label="Layer 1 Discharged" value={`−${fmt(v.layer1?.dischargedTEU)}`} />
        <Stat label="Layer 2 Loaded" value={`+${fmt(v.layer2?.loadedTEU)}`} />
        <Stat label="Layer 2 Discharged" value={`−${fmt(v.layer2?.dischargedTEU)}`} />
        {hasRemaining && (
          <Stat
            label="Remaining Onboard"
            value={`${fmt(v.remainingOnboardTEU)} TEU`}
            sub="expected to discharge here, not found"
            danger
          />
        )}
      </div>

      {/* Per-leg detail (capacity engine rewritten 2026-11-10): TEU aboard on every segment of the run, both layers */}
      {(v.segments || []).length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 overflow-x-auto">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Per leg (POL → POD)</p>
          <table className="w-full text-[12px] border-collapse" style={{ minWidth: 560 }}>
            <thead>
              <tr className="text-left text-[10px] text-gray-400 uppercase tracking-wider">
                <th className="py-1 pr-3 font-semibold">Leg</th>
                <th className="py-1 pr-3 font-semibold text-right">Loaded at start</th>
                <th className="py-1 pr-3 font-semibold text-right">Discharged at end</th>
                <th className="py-1 pr-3 font-semibold text-right">Aboard</th>
                <th className="py-1 pr-3 font-semibold text-right">L1 / L2</th>
                <th className="py-1 pr-3 font-semibold text-right">Remaining</th>
                <th className="py-1 font-semibold text-right">Util</th>
              </tr>
            </thead>
            <tbody>
              {v.segments.map(sg => {
                const over = sg.remainingTEU != null && sg.remainingTEU < 0;
                return (
                  <tr key={sg.index} className={`border-t border-gray-50 ${over ? 'text-red-600' : 'text-gray-700'}`}>
                    <td className="py-1 pr-3 whitespace-nowrap">{sg.fromPort?.name || sg.fromPort?.code} <span className="text-gray-300">→</span> {sg.toPort?.name || sg.toPort?.code}</td>
                    <td className="py-1 pr-3 text-right">+{fmt(sg.loadedTEU)}</td>
                    <td className="py-1 pr-3 text-right">−{fmt(sg.dischargedTEU)}</td>
                    <td className="py-1 pr-3 text-right font-semibold">{fmt(sg.onboardTEU)}</td>
                    <td className="py-1 pr-3 text-right text-gray-400">{fmt(sg.layer1?.onboardTEU)} / {fmt(sg.layer2?.onboardTEU)}</td>
                    <td className="py-1 pr-3 text-right">{sg.remainingTEU != null ? fmt(sg.remainingTEU) : '—'}</td>
                    <td className="py-1 text-right font-semibold">{sg.utilisationPct != null ? `${sg.utilisationPct}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ownWarnings.length > 0 && (
        <div className="mt-4 pt-3 border-t border-red-100 flex flex-col gap-1.5">
          {ownWarnings.map((w, i) => (
            <p key={i} className="flex items-start gap-2 text-[12px] text-red-700">
              <span className="flex-shrink-0 mt-px">{ICONS[w.code] || '⚠️'}</span>
              <span>{w.message}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
