'use client';

import { useRouter } from 'next/navigation';

/**
 * Shared shell for all report pages.
 * Props:
 *   title       string
 *   subtitle    string
 *   filters     ReactNode  – filter controls (top bar)
 *   summary     ReactNode  – stat cards row
 *   children    ReactNode  – data table / body
 *   onExport    function   – optional Excel export handler
 *   exporting   boolean    – loading state for export button
 *   backHref    string     – default '/reports'
 */
export default function ReportLayout({
  title, subtitle,
  filters, summary, children,
  onExport, exporting = false,
  backHref = '/reports',
}) {
  const router = useRouter();

  return (
    <div className="animate-fadeIn flex flex-col gap-5">

      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => router.push(backHref)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M15 19l-7-7 7-7"/>
              </svg>
              Reports
            </button>
            <span className="text-gray-200">/</span>
            <span className="text-sm font-medium text-gray-700">{title}</span>
          </div>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>

        {onExport && (
          <button
            onClick={onExport}
            disabled={exporting}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
          >
            {exporting ? (
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            )}
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        )}
      </div>

      {/* Filters */}
      {filters && (
        <div className="card p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Filters</p>
          {filters}
        </div>
      )}

      {/* Summary cards */}
      {summary && <div>{summary}</div>}

      {/* Body / table */}
      {children}
    </div>
  );
}
