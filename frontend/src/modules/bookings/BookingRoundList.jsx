'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { bookingsService } from '@/services/bookings.service';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const fmtMoney = (n) => (n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—');

/**
 * Bookings page, second level: the rounds of the opened vessel (Planned / Active, plus Completed when asked).
 * Clicking a round opens its booking rows.
 * Mount with a `key` that changes with the section / vessel / filters so paging restarts at 1.
 */
export default function BookingRoundList({ tab, vesselId, filters, includeClosed, onOpen }) {
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['booking-round-summary', tab, vesselId, filters, includeClosed, page],
    queryFn: () => bookingsService.roundSummary({ tab, vesselId, ...filters, includeClosed: includeClosed ? 1 : 0, page, limit: 20 }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const rows = data?.data || [];
  const pagination = data?.pagination;

  return (
    <>
      <div className="card overflow-hidden min-w-0">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : !rows.length ? (
          <EmptyState
            title="No rounds to show for this vessel"
            message={includeClosed ? 'This vessel has no Planned, Active or Completed round with bookings of this kind.' : 'This vessel has no Planned or Active round. Tick "Include completed rounds" to see finished ones.'}
          />
        ) : (
          <div className="overflow-x-auto" style={{ opacity: isFetching && isPlaceholderData ? 0.55 : 1, transition: 'opacity .15s' }}>
            <table className="w-full border-collapse" style={{ minWidth: 760 }}>
              <thead>
                <tr className="table-header">
                  {['Round', 'Status', 'Voyages', 'Bookings', 'Total TEU', 'Total Freight', ''].map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.roundId} className="table-row cursor-pointer" onClick={() => onOpen(r)}>
                    <td>
                      <span className="mono text-xs font-semibold text-gray-700">{r.roundNumber}</span>
                      {r.roundName && <span className="text-xs text-gray-400"> — {r.roundName}</span>}
                    </td>
                    <td><Badge label={r.roundStatus} /></td>
                    <td><span className="mono text-xs text-gray-700">{r.voyages}</span></td>
                    <td><span className="mono text-xs text-gray-700">{r.bookings.toLocaleString()}</span></td>
                    <td><span className="mono text-xs text-gray-700">{r.totalTEU.toLocaleString()}</span></td>
                    <td><span className="mono text-xs font-semibold text-teal-700 whitespace-nowrap">{fmtMoney(r.totalFreight)}</span></td>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                        aria-label={`Open the bookings of round ${r.roundNumber}`}
                        className="text-xs font-medium text-teal-600 hover:text-teal-800 transition whitespace-nowrap"
                      >
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination?.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">{pagination.total} round{pagination.total !== 1 ? 's' : ''}</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}
