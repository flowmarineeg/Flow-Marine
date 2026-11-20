'use client';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null;

const STATE_LABEL = { done: 'passed', current: 'at port', next: 'next', upcoming: '' };

/**
 * Port strip: the voyage's port calls in travel order with their state (from the summary).
 * Clicking a port filters the two booking tabs only (cards stay voyage-wide). "All ports" clears it.
 * `ports` comes from the summary: [{ index, legKey, portId, name, code, eta, etd, state }].
 */
export default function VoyagePortStrip({ ports, selected, onSelect }) {
  if (!ports?.length) return null;
  const isSel = (p) => selected && selected.legKey === p.legKey && selected.portId === p.portId;

  const stateCls = (p) => {
    if (p.state === 'current') return 'border-teal-500 bg-teal-50 text-teal-700';
    if (p.state === 'next')    return 'border-teal-300 bg-white text-gray-800';
    if (p.state === 'done')    return 'border-gray-200 bg-gray-50 text-gray-400';
    return 'border-gray-200 bg-white text-gray-600';
  };

  return (
    <div className="card p-4 mb-4 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Port calls</p>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${
            !selected ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-500 hover:text-gray-800'
          }`}
        >
          All ports
        </button>
      </div>

      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {ports.map((p, i) => (
          <div key={`${p.legKey}-${p.index}`} className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => onSelect(isSel(p) ? null : { legKey: p.legKey, portId: p.portId, name: p.name })}
              className={`text-left rounded-lg border px-3 py-2 min-w-[130px] transition ${stateCls(p)} ${isSel(p) ? 'ring-2 ring-teal-500' : 'hover:border-teal-400'}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="mono text-[10px] text-gray-400">{p.index + 1}</span>
                <span className="text-[13px] font-semibold truncate">{p.name || p.code || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400">
                {p.code && <span className="mono">{p.code}</span>}
                {p.eta && <span>ETA {fmt(p.eta)}</span>}
                {STATE_LABEL[p.state] && (
                  <span className={`font-semibold uppercase tracking-wide ${p.state === 'upcoming' || p.state === 'done' ? '' : 'text-teal-600'}`}>{STATE_LABEL[p.state]}</span>
                )}
              </div>
            </button>
            {i < ports.length - 1 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400 mt-2">
        {selected
          ? `Showing bookings whose POL or POD is ${selected.name}. The cards above show the whole voyage.`
          : 'Click a port to show only the bookings that load or discharge there.'}
      </p>
    </div>
  );
}
