'use client';

/**
 * CapacityWarnings — Sprint 022
 * Displays engine warnings (overbooked segments, missing data, etc.)
 */
export default function CapacityWarnings({ warnings = [] }) {
  if (!warnings?.length) return null;

  const ICONS = {
    VOYAGE_OVERBOOKED:           '🔴',
    BOOKING_PORT_NOT_IN_ROUND:   '⚠️',
    L1_BOOKING_PORT_NOT_IN_ROUND: '🟡',
    CANCELLED_VOYAGES_EXCLUDED:  '🔵',
    MISSING_TEU_MAPPING:         '🟡',
    MISSING_CONTAINER_TYPE:      '🟡',
    DELETED_CONTAINER_TYPE:      '🔵',
  };

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-2">
        Engine Warnings ({warnings.length})
      </p>
      <ul className="flex flex-col gap-1.5">
        {warnings.map((w, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-amber-800">
            <span className="flex-shrink-0 mt-px">{ICONS[w.code] || '⚠️'}</span>
            <span>{w.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
