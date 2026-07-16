'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trackingService } from '@/services/tracking.service';
import Pagination    from '@/components/ui/Pagination';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge         from '@/components/ui/Badge';

const fmt = (d) => d
  ? new Date(d).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  : '—';

const STATUS_COLORS = {
  'At Port':    'bg-blue-50 text-blue-700 border-blue-200',
  'Departed':   'bg-amber-50 text-amber-700 border-amber-200',
  'In Transit': 'bg-purple-50 text-purple-700 border-purple-200',
  'Arrived':    'bg-green-50 text-green-700 border-green-200',
  'Anchored':   'bg-gray-100 text-gray-600 border-gray-200',
  'Delayed':    'bg-red-50 text-red-600 border-red-200',
};

export default function TrackingHistoryTable({ voyageId, refreshKey }) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['tracking-history', voyageId, page, refreshKey],
    queryFn:  () => trackingService.getHistory(voyageId, { page, limit: 10 }).then(r => r.data),
    enabled:  !!voyageId,
  });

  const entries    = data?.data?.entries || [];
  const pagination = data?.pagination;

  if (!voyageId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/>
          <circle cx="12" cy="11" r="3"/>
        </svg>
        <p className="text-sm">Select a voyage to view its tracking history</p>
      </div>
    );
  }

  if (isLoading) return <LoadingSpinner fullPage />;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg className="w-10 h-10 mb-3 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <p className="text-sm">No tracking entries yet for this voyage</p>
        <p className="text-xs mt-1 text-gray-300">Submit a position update using the form</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Latest position banner */}
      {entries[0] && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold text-teal-500 uppercase tracking-wider mb-1">Latest Position</p>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${STATUS_COLORS[entries[0].status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {entries[0].status}
              </span>
              <span className="ml-2 text-sm font-semibold text-gray-800">
                {entries[0].portId?.name}
                {entries[0].terminalId && <span className="text-gray-400 font-normal"> — {entries[0].terminalId.name}</span>}
              </span>
            </div>
            <span className="mono text-xs text-gray-500">{fmt(entries[0].lastUpdate)}</span>
          </div>
        </div>
      )}

      {/* History table */}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full border-collapse">
          <thead>
            <tr className="table-header">
              {['Date / Time', 'Port', 'Terminal', 'Status', 'Remarks', 'By'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <tr key={entry._id} className="table-row">
                <td>
                  <span className="mono text-xs text-gray-600">{fmt(entry.lastUpdate)}</span>
                  {idx === 0 && (
                    <span className="ml-2 text-[10px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full border border-teal-200">
                      Latest
                    </span>
                  )}
                </td>
                <td>
                  <span className="text-sm font-medium text-gray-700">{entry.portId?.name}</span>
                  {entry.portId?.code && (
                    <span className="mono text-[10px] text-gray-400 ml-1">{entry.portId.code}</span>
                  )}
                </td>
                <td className="text-xs text-gray-500">{entry.terminalId?.name || <span className="text-gray-300">—</span>}</td>
                <td>
                  <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[entry.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {entry.status}
                  </span>
                </td>
                <td className="text-xs text-gray-500 max-w-[160px] truncate">{entry.remarks || <span className="text-gray-300">—</span>}</td>
                <td className="text-xs text-gray-400">{entry.createdBy?.name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">{pagination.total} entries total</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Immutable notice */}
      <p className="text-[11px] text-gray-300 text-center">
        Tracking history is append-only — entries cannot be edited or deleted
      </p>
    </div>
  );
}
