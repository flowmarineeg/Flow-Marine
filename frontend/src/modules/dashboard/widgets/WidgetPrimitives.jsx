'use client';

/**
 * Sprint 039 — shared presentational primitives reused by every Widget.
 * These hold no query, no filter-reading logic, and no navigation logic
 * of their own (Section 3.4) — they render whatever their owning Widget
 * already fetched.
 *
 * Restyle 2026-11-17: navy/orange system. Colour is reserved for meaning.
 */

// iconBg / iconColor are accepted for API compatibility but ignored: every KPI
// uses the same navy chip so colour carries status, not decoration.
export function KpiCard({ icon: Icon, label, value, sub, loading, onClick }) {
  const interactive = !!onClick;
  return (
    <div
      className={`card p-4 flex items-center gap-4 border-l-4 border-l-[var(--navy)] ${interactive ? 'cursor-pointer hover:border-l-[var(--teal)] hover:shadow-md transition' : ''}`}
      onClick={onClick}
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-100">
        <Icon className="text-xl text-blue-800" />
      </div>
      <div className="min-w-0">
        <p className="dash-label !mb-0 truncate">{label}</p>
        {loading ? <div className="h-7 w-16 bg-gray-100 rounded animate-pulse mt-1" />
                 : <p className="kpi-num text-2xl font-bold text-blue-800 leading-tight">{value}</p>}
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function WidgetCard({ title, action, children, className = '' }) {
  return (
    <div className={`card p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b-2 border-[var(--border)]">
          {title && <h3 className="text-xs font-bold text-blue-800 uppercase tracking-widest m-0">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function WidgetEmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-10 text-gray-500 text-sm text-center px-4">
      {message}
    </div>
  );
}

export function WidgetSkeleton({ rows = 3, height = 40 }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-gray-100 rounded-lg animate-pulse" style={{ height }} />
      ))}
    </div>
  );
}

export const fmtMoney = (n) => n != null
  ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  : '$0';
export const fmtNum = (n) => (n ?? 0).toLocaleString();
