'use client';

import { useRouter } from 'next/navigation';
import { useQuery }  from '@tanstack/react-query';
import { auditLogsService } from '@/services/auditLogs.service';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const fmt = (d) => d
  ? new Date(d).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  : '—';

const ACTION_STYLE = {
  CREATE: 'bg-green-50 text-green-700 border-green-200',
  UPDATE: 'bg-blue-50 text-blue-700 border-blue-200',
  DELETE: 'bg-red-50 text-red-600 border-red-200',
  LOGIN:  'bg-gray-100 text-gray-600 border-gray-200',
  LOGOUT: 'bg-gray-100 text-gray-600 border-gray-200',
};

// Map module name → frontend route prefix
const MODULE_ROUTES = {
  services:       '/services',
  rounds:         '/rounds',
  voyages:        '/voyages',
  bookings:       '/bookings',
  expenses:       '/expenses',
  invoices:       '/invoices',
  vessels:        '/vessels',
  agents:         '/agents',
  users:          '/users',
  roles:          '/roles',
  containerTypes: '/container-types',
  expenseTypes:   '/expense-types',
  locations:      '/locations',
};

// Compute changed fields between old and new values
const getDiff = (oldVals, newVals) => {
  if (!oldVals || !newVals) return null;
  const allKeys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);
  const changed = [];
  allKeys.forEach(key => {
    const oval = JSON.stringify(oldVals[key]);
    const nval = JSON.stringify(newVals[key]);
    if (oval !== nval) changed.push(key);
  });
  return new Set(changed);
};

/* ── Value renderer ───────────────────────────────────────────────────────── */
function ValueDisplay({ data, changedKeys, side }) {
  if (!data) return <p className="text-sm text-gray-400 italic">No data recorded</p>;

  return (
    <div className="flex flex-col gap-1.5">
      {Object.entries(data).map(([key, val]) => {
        const isChanged = changedKeys?.has(key);
        const displayVal = val === null || val === undefined
          ? <span className="text-gray-300 italic">null</span>
          : typeof val === 'object'
            ? <span className="mono text-[11px] text-gray-500 break-all">{JSON.stringify(val)}</span>
            : <span className="mono text-[12px] break-all">{String(val)}</span>;

        return (
          <div
            key={key}
            className={`flex gap-2 px-3 py-1.5 rounded-lg text-[12px] ${
              isChanged
                ? side === 'old'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-green-50 border border-green-200'
                : 'bg-gray-50 border border-transparent'
            }`}
          >
            <span className={`font-semibold w-36 flex-shrink-0 ${isChanged ? (side === 'old' ? 'text-red-500' : 'text-green-600') : 'text-gray-400'}`}>
              {key}
            </span>
            <span className="text-gray-700 flex-1">{displayVal}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function AuditLogDetail({ logId }) {
  const router = useRouter();

  const { data: log, isLoading, isError } = useQuery({
    queryKey: ['audit-log', logId],
    queryFn:  () => auditLogsService.getById(logId).then(r => r.data.data),
  });

  if (isLoading) return <LoadingSpinner fullPage />;
  if (isError || !log) {
    return (
      <div className="flex flex-col items-center py-24 text-gray-400">
        <p className="text-sm">Audit log entry not found</p>
        <button onClick={() => router.push('/audit-logs')} className="mt-3 text-sm text-teal-600 hover:underline">
          ← Back to Audit Log
        </button>
      </div>
    );
  }

  const changedKeys = getDiff(log.oldValues, log.newValues);
  const actionCls   = ACTION_STYLE[log.action] || ACTION_STYLE.LOGIN;
  const recordRoute = MODULE_ROUTES[log.module];
  const canView     = recordRoute && log.recordId && log.action !== 'DELETE';

  return (
    <div className="animate-fadeIn flex flex-col gap-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push('/audit-logs')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Audit Log
        </button>
        <span className="text-gray-200">/</span>
        <span className="mono text-sm font-bold text-gray-600">{log.action} · {log.module}</span>
      </div>

      {/* Header card */}
      <div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border ${actionCls}`}>
                {log.action}
              </span>
              <span className="text-sm font-semibold text-gray-700">{log.module}</span>
              {log.recordNumber && (
                <span className="mono text-xs text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full font-semibold">
                  {log.recordNumber}
                </span>
              )}
            </div>
            <p className="mono text-xs text-gray-400">{fmt(log.timestamp)}</p>
          </div>

          {/* View record link */}
          {canView && (
            <button
              onClick={() => router.push(`${recordRoute}/${log.recordId}`)}
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
              View Record
            </button>
          )}
        </div>
      </div>

      {/* User & meta info */}
      <div className="card p-5">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Event Details</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          {[
            { label: 'User',       val: log.userId?.name || '—' },
            { label: 'Email',      val: log.userEmail || '—' },
            { label: 'Role',       val: log.userId?.role || '—' },
            { label: 'IP Address', val: log.ipAddress || '—', mono: true },
            { label: 'Module',     val: log.module },
            { label: 'Action',     val: log.action },
            { label: 'Record ID',  val: log.recordId ? String(log.recordId) : '—', mono: true },
            { label: 'Timestamp',  val: fmt(log.timestamp), mono: true },
          ].map(({ label, val, mono }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
              <p className={`text-gray-700 ${mono ? 'mono text-xs' : 'text-sm'} break-all`}>{val}</p>
            </div>
          ))}
        </div>

        {/* User-agent (collapsible detail) */}
        {log.userAgent && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">User Agent</p>
            <p className="mono text-[11px] text-gray-400 break-all leading-relaxed">{log.userAgent}</p>
          </div>
        )}
      </div>

      {/* Diff view */}
      {(log.oldValues || log.newValues) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Old values */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Before</p>
              {changedKeys && log.oldValues && (
                <span className="ml-auto text-[10px] text-red-400 font-semibold">
                  {changedKeys.size} field{changedKeys.size !== 1 ? 's' : ''} changed
                </span>
              )}
            </div>
            <ValueDisplay data={log.oldValues} changedKeys={changedKeys} side="old" />
          </div>

          {/* New values */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0" />
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">After</p>
            </div>
            <ValueDisplay data={log.newValues} changedKeys={changedKeys} side="new" />
          </div>
        </div>
      )}

      {/* CREATE with no oldValues / DELETE with no newValues — show only the relevant side */}
      {log.action === 'CREATE' && !log.oldValues && log.newValues && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0" />
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Created Record</p>
          </div>
          <ValueDisplay data={log.newValues} changedKeys={null} side="new" />
        </div>
      )}

      {log.action === 'DELETE' && log.oldValues && !log.newValues && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Deleted Record</p>
          </div>
          <ValueDisplay data={log.oldValues} changedKeys={null} side="old" />
        </div>
      )}

      {/* No value data */}
      {!log.oldValues && !log.newValues && (
        <div className="card p-5 text-center text-sm text-gray-400">
          No before/after data was recorded for this event (e.g. login/logout actions).
        </div>
      )}
    </div>
  );
}
