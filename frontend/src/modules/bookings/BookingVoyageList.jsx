'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { bookingsService } from '@/services/bookings.service';
import { getVoyageLabel } from '@/utils/voyageLabel';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const fmtMoney = (n) => (n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—');

const EMPTY = {
  estimated:   { title: 'No voyages with estimated bookings', message: 'Create an estimated booking to see its voyage here.' },
  operational: { title: 'No voyages with bookings', message: 'Create or import a booking to see its voyage here.' },
  discharged:  { title: 'No voyages with discharged bookings', message: 'Voyages appear here once a Discharge import matches their containers.' },
  remaining:   { title: 'No voyages with remaining bookings', message: 'Voyages appear here when a Discharge import did not find containers Final Loading expected.' },
};

/**
 * Bookings page, first level of every tab: one row per voyage that has bookings of that kind
 * (round, voyage name + number, bookings, total TEU, total freight). Clicking a row opens that voyage's bookings.
 * Mount it with a `key` that changes with the tab / filters so the page number starts again from 1.
 */
export default function BookingVoyageList({ tab, filters, onOpen }) {
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['booking-voyage-summary', tab, filters, page],
    queryFn: () => bookingsService.voyageSummary({ tab, ...filters, page, limit: 20 }).then((r) => r.data),
    placeholderData: keepPreviousData, // keep the previous page on screen while the next one loads
  });

  const rows = data?.data || [];
  const pagination = data?.pagination;

  return (
    <>
      <div className="card overflow-hidden min-w-0">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : !rows.length ? (
          <EmptyState title={EMPTY[tab].title} message={EMPTY[tab].message} />
        ) : (
          <div className="overflow-x-auto" style={{ opacity: isFetching && isPlaceholderData ? 0.55 : 1, transition: 'opacity .15s' }}>
            <table className="w-full border-collapse" style={{ minWidth: 820 }}>
              <thead>
                <tr className="table-header">
                  {['Round', 'Voyage Name', 'Voyage No.', 'Bookings', 'Total TEU', 'Total Freight', ''].map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.voyageId} className="table-row cursor-pointer" onClick={() => onOpen(r)}>
                    <td>
                      <span className="text-xs font-semibold text-gray-700">{r.roundNumber || '—'}</span>
                      {r.roundName && <span className="text-xs text-gray-400"> — {r.roundName}</span>}
                    </td>
                    <td><span className="text-xs text-gray-700">{r.voyageName || <span className="text-gray-300">—</span>}</span></td>
                    <td><span className="mono text-xs font-bold text-teal-600 whitespace-nowrap">{r.voyageNumber}</span></td>
                    <td><span className="mono text-xs text-gray-700">{r.bookings.toLocaleString()}</span></td>
                    <td><span className="mono text-xs text-gray-700">{r.totalTEU.toLocaleString()}</span></td>
                    <td><span className="mono text-xs font-semibold text-teal-700 whitespace-nowrap">{fmtMoney(r.totalFreight)}</span></td>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                        aria-label={`Open bookings of ${getVoyageLabel(r)}`}
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
          <p className="text-xs text-gray-400">{pagination.total} voyage{pagination.total !== 1 ? 's' : ''}</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}
