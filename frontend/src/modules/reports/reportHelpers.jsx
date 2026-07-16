'use client';

/**
 * ReportStatCard — summary metric for report pages.
 */
export function ReportStatCard({ label, value, sub, accent = false }) {
  return (
    <div className={`card px-5 py-4 flex flex-col gap-1 ${accent ? 'border-teal-200 bg-teal-50/40' : ''}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold leading-tight ${accent ? 'text-teal-700' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

/**
 * ReportEmptyState — shown when filters return no rows.
 */
export function ReportEmptyState({ message = 'No data matches the selected filters.' }) {
  return (
    <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
      <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  );
}

/**
 * Shared select style for report filter bars.
 */
export const rsc = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

/**
 * Format a number as money.
 */
export const fmtMoney = (n) =>
  n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export const fmtNum = (n) => (n ?? 0).toLocaleString();
