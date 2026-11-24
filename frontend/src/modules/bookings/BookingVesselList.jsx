'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { bookingsService } from '@/services/bookings.service';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const fmtMoney = (n) => (n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—');

const EMPTY = {
  estimated:   { title: 'No vessels with open rounds', message: 'A vessel appears here when it has a Planned or Active round with a voyage that is not cancelled.' },
  operational: { title: 'No vessels with open rounds', message: 'A vessel appears here when it has a Planned or Active round with a voyage that is not cancelled.' },
  discharged:  { title: 'No vessels with discharged bookings', message: 'Vessels appear here once a Discharge import matches their containers.' },
  remaining:   { title: 'No vessels with remaining bookings', message: 'Vessels appear here when a Discharge import did not find containers Final Loading expected.' },
};

/**
 * Bookings page, first level of every section: one row per vessel (open rounds, voyages, bookings, total TEU, total freight).
 * Estimated / Operational also list vessels with 0 bookings (so booking can start there); Discharged / Remaining only
 * vessels that have such bookings. Mount with a `key` that changes with the section / filters so paging restarts at 1.
 */
export default function BookingVesselList({ tab, filters, includeClosed, onOpen }) {
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['booking-vessel-summary', tab, filters, includeClosed, page],
    queryFn: () => bookingsService.vesselSummary({ tab, ...filters, includeClosed: includeClosed ? 1 : 0, page, limit: 20 }).then((r) => r.data),
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
          <EmptyState title={EMPTY[tab].title} message={EMPTY[tab].message} />
        ) : (
          <div className="overflow-x-auto" style={{ opacity: isFetching && isPlaceholderData ? 0.55 : 1, transition: 'opacity .15s' }}>
            <table className="w-full border-collapse" style={{ minWidth: 760 }}>
              <thead>
                <tr className="table-header">
                  {['Vessel', 'Rounds', 'Voyages', 'Bookings', 'Total TEU', 'Total Freight', ''].map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.vesselId} className="table-row cursor-pointer" onClick={() => onOpen(r)}>
                    <td>
                      <span className="text-sm font-semibold text-gray-800">{r.vesselName}</span>
                      <span className="ml-1.5 mono text-[10px] text-gray-400">{r.vesselCode}</span>
                    </td>
                    <td><span className="mono text-xs text-gray-700">{r.rounds}</span></td>
                    <td><span className="mono text-xs text-gray-700">{r.voyages}</span></td>
                    <td><span className="mono text-xs text-gray-700">{r.bookings.toLocaleString()}</span></td>
                    <td><span className="mono text-xs text-gray-700">{r.totalTEU.toLocaleString()}</span></td>
                    <td><span className="mono text-xs font-semibold text-teal-700 whitespace-nowrap">{fmtMoney(r.totalFreight)}</span></td>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                        aria-label={`Open the rounds of ${r.vesselName}`}
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
          <p className="text-xs text-gray-400">{pagination.total} vessel{pagination.total !== 1 ? 's' : ''}</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}
