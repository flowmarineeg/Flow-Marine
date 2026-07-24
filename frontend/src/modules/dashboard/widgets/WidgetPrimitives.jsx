'use client';

/**
 * Sprint 039 — shared presentational primitives reused by every Widget.
 * These hold no query, no filter-reading logic, and no navigation logic
 * of their own (Section 3.4) — they render whatever their owning Widget
 * already fetched.
 */

export function KpiCard({ icon: Icon, label, value, sub, iconBg, iconColor, loading, onClick }) {
  return (
    <div
      className={`card p-4 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-sm transition' : ''}`}
      onClick={onClick}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className={`text-xl ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        {loading ? <div className="h-6 w-16 bg-gray-100 rounded animate-pulse mt-1" />
                 : <p className="text-xl font-bold text-gray-800 leading-tight">{value}</p>}
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function WidgetCard({ title, action, children, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function WidgetEmptyState({ message }) {
  return (
    <div className="flex items-center justify-center py-10 text-gray-300 text-sm text-center px-4">
      {message}
    </div>
  );
}

export function WidgetSkeleton({ rows = 3, height = 40 }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-gray-50 rounded-lg animate-pulse" style={{ height }} />
      ))}
    </div>
  );
}

export const fmtMoney = (n) => n != null
  ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  : '$0';
export const fmtNum = (n) => (n ?? 0).toLocaleString();
