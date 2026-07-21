'use client';

/**
 * CapacitySegmentTable — Sprint 023 revision (layout fix)
 *
 * The table lives inside an overflow-x-auto wrapper so it never pushes
 * the page wider. Long content truncates or wraps inside its cell.
 */

const fmt = (n) => n == null ? '—' : Number(n).toLocaleString();

function UtilBar({ pct }) {
  if (pct == null) return <span className="text-[11px] text-gray-300">—</span>;
  const clamped = Math.min(pct, 100);
  const color   = pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-orange-400' : pct >= 70 ? 'bg-amber-400' : 'bg-teal-500';
  const text    = pct >= 100 ? 'text-red-600' : pct >= 90 ? 'text-orange-500' : pct >= 70 ? 'text-amber-600' : 'text-teal-600';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className={`text-[11px] font-semibold flex-shrink-0 ${text}`}>{pct}%</span>
    </div>
  );
}

/* Compact breakdown: "L2 +120 / L1 +30" — stays on one line, truncates if needed */
function Breakdown({ l2, l1, sign }) {
  const parts = [];
  if ((l2 || 0) > 0) parts.push(<span key="l2" className="text-blue-500">{`L2 ${sign}${fmt(l2)}`}</span>);
  if ((l1 || 0) > 0) parts.push(<span key="l1" className="text-purple-500">{`L1 ${sign}${fmt(l1)}`}</span>);
  if (!parts.length) return null;
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0 mt-0.5 justify-end text-[10px]">
      {parts}
    </div>
  );
}

export default function CapacitySegmentTable({ voyages = [], vesselCapacity = null }) {
  if (!voyages.length) return null;

  return (
    <div className="flex flex-col gap-3 min-w-0">

      {/* Legend */}
      <div className="flex items-center justify-between flex-wrap gap-2 min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cargo Flow — Voyage Chain</p>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="flex items-center gap-1 text-[10px] text-gray-400">
            <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />L1 Manual
          </span>
          <span className="flex items-center gap-1 text-[10px] text-gray-400">
            <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />L2 Operational
          </span>
        </div>
      </div>

      {/* Table — scrolls horizontally inside the card, never pushes the page */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 min-w-0">
        <table className="w-full text-[12px] border-collapse" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Voyage</th>
              <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Route</th>
              <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Start</th>
              <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-blue-400 uppercase tracking-wider whitespace-nowrap">Loaded</th>
              <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-orange-400 uppercase tracking-wider whitespace-nowrap">Discharged</th>
              <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Onboard</th>
              <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Remaining</th>
              <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Util</th>
            </tr>
          </thead>
          <tbody>
            {voyages.map((v, i) => {
              const isOver   = v.remainingTEU != null && v.remainingTEU < 0;
              const rowBg    = isOver
                ? 'bg-red-50'
                : v.utilisationPct >= 90 ? 'bg-orange-50/40'
                : v.utilisationPct >= 70 ? 'bg-amber-50/30'
                : '';

              return (
                <tr key={String(v.voyageId)} className={`border-b border-gray-50 ${rowBg}`}>

                  {/* Voyage */}
                  <td className="py-2.5 px-3 align-top">
                    <p className="mono text-xs font-bold text-gray-700 whitespace-nowrap">{v.voyageNumber}</p>
                    {v.isManual && <span className="text-[9px] text-amber-500">manual</span>}
                  </td>

                  {/* Route */}
                  <td className="py-2.5 px-3 align-top whitespace-nowrap">
                    <span className="font-semibold text-gray-700 text-xs">
                      {v.fromPort?.code || v.fromPort?.name || '—'}
                    </span>
                    <span className="text-gray-300 mx-1 text-[10px]">→</span>
                    <span className="font-semibold text-gray-700 text-xs">
                      {v.toPort?.code || v.toPort?.name || '—'}
                    </span>
                  </td>

                  {/* Onboard at start */}
                  <td className="py-2.5 px-3 text-right align-top">
                    <span className={`text-xs font-semibold ${v.onboardStart > 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                      {fmt(v.onboardStart)}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-0.5">TEU</span>
                    <p className="text-[9px] text-gray-300">{i === 0 ? 'start' : 'carried'}</p>
                  </td>

                  {/* Loaded */}
                  <td className="py-2.5 px-3 text-right align-top">
                    {v.loadedTEU === 0 ? (
                      <span className="text-gray-300 text-xs">—</span>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-blue-600">+{fmt(v.loadedTEU)}</span>
                        <span className="text-[10px] text-gray-400 ml-0.5">TEU</span>
                        <Breakdown l2={v.layer2?.loadedTEU} l1={v.layer1?.loadedTEU} sign="+" />
                      </>
                    )}
                  </td>

                  {/* Discharged */}
                  <td className="py-2.5 px-3 text-right align-top">
                    {v.dischargedTEU === 0 ? (
                      <span className="text-gray-300 text-xs">—</span>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-orange-500">−{fmt(v.dischargedTEU)}</span>
                        <span className="text-[10px] text-gray-400 ml-0.5">TEU</span>
                        <Breakdown l2={v.layer2?.dischargedTEU} l1={v.layer1?.dischargedTEU} sign="−" />
                      </>
                    )}
                  </td>

                  {/* Onboard transit */}
                  <td className="py-2.5 px-3 text-right align-top">
                    <span className={`text-xs font-bold ${isOver ? 'text-red-600' : 'text-gray-800'}`}>
                      {fmt(v.onboardTEU)}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-0.5">TEU</span>
                    {isOver && <p className="text-[9px] text-red-400">over</p>}
                  </td>

                  {/* Remaining */}
                  <td className="py-2.5 px-3 text-right align-top">
                    {v.remainingTEU == null ? (
                      <span className="text-gray-300 text-xs">—</span>
                    ) : (
                      <>
                        <span className={`text-xs font-semibold ${v.remainingTEU < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {fmt(Math.abs(v.remainingTEU))}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-0.5">TEU</span>
                      </>
                    )}
                  </td>

                  {/* Util bar */}
                  <td className="py-2.5 px-3 align-top">
                    <UtilBar pct={v.utilisationPct} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {voyages.length > 1 && (
        <p className="text-[10px] text-gray-400">
          Onboard at start of each voyage = onboard at end of the previous voyage.
          Cargo remains onboard until discharged at its POD.
        </p>
      )}
    </div>
  );
}
