'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { bookingsService } from '@/services/bookings.service';
import { BOOKING_STATUS } from '@/utils/constants';
import SearchBar from '@/components/ui/SearchBar';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import BookingsTable from '@/modules/bookings/BookingsTable';
import ManualBookingsTable from '@/modules/bookings/ManualBookingsTable';

const sc = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

/**
 * One booking tab of the Voyage page, read-only (View only; edit and delete stay in the Bookings page).
 * layer 'estimated' = Layer 1 (manual), 'operational' = Layer 2, all statuses.
 * `port` = { legKey, portId, name } filters to bookings whose POL or POD is that port call.
 * Page / search / status reset when the port filter changes (the parent remounts this with a key).
 */
export default function VoyageBookingsTab({ voyageId, layer, port }) {
  const router = useRouter();
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind]     = useState(''); // estimated tab only: '' | Estimate | Allocation

  const estimated = layer === 'estimated';
  const portLegKey = port?.legKey || '';
  const portId     = port?.portId || '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [estimated ? 'manual-bookings' : 'bookings', 'voyage-page', voyageId, page, search, status, kind, portLegKey, portId],
    queryFn:  () => {
      const params = { page, limit: 20, search, status, voyageId, portLegKey, portId, ...(estimated ? { kind } : {}) };
      return (estimated ? bookingsService.listManual(params) : bookingsService.list(params)).then(r => r.data);
    },
  });

  const rows = data?.data || [];
  const pagination = data?.pagination;
  const noun = estimated ? 'estimated booking' : 'booking';

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="flex-1 min-w-[200px]">
          <SearchBar
            value={search}
            onChange={v => { setSearch(v); setPage(1); }}
            placeholder={estimated ? 'Search MB-number…' : 'Search booking no, shipper, consignee…'}
          />
        </div>
        {estimated && (
          <select value={kind} onChange={e => { setKind(e.target.value); setPage(1); }} className={sc}>
            <option value="">All Types</option>
            <option value="Estimate">Estimates</option>
            <option value="Allocation">Allocations</option>
          </select>
        )}
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={sc}>
          <option value="">All Statuses</option>
          {BOOKING_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden min-w-0">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : isError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-500 mb-2">Could not load the bookings.</p>
            <button onClick={() => refetch()} className="text-sm text-teal-600 hover:underline">Try again</button>
          </div>
        ) : !rows.length ? (
          <EmptyState
            title={`No ${noun}s for this voyage${port ? ` at ${port.name}` : ''}`}
            message={search || status ? 'Try clearing the search or the status filter.' : 'Nothing has been booked here yet.'}
          />
        ) : estimated ? (
          <ManualBookingsTable rows={rows} onView={(m) => router.push(`/bookings/manual/${m._id}`)} />
        ) : (
          <BookingsTable rows={rows} onView={(b) => router.push(`/bookings/${b._id}`)} />
        )}
      </div>

      {pagination?.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">{pagination.total} {noun}{pagination.total !== 1 ? 's' : ''}</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
