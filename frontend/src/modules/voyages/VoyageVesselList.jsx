'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVoyageVessels } from '@/hooks/useVoyageVessels';
import PageHeader from '@/components/ui/PageHeader';
import SearchBar from '@/components/ui/SearchBar';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import LoadBadge from '@/components/ui/LoadBadge';
import Badge from '@/components/ui/Badge';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null;

/**
 * Voyages page, level 1: the vessels that have an open round (Planned / Active) with an open voyage.
 * Row: vessel, round (+N more), next voyage (+N more), vessel TEU, booked TEU (all open voyages), peak load %.
 * TEU and % come from the capacity engine. Click a row to open that vessel's rounds and voyages.
 */
export default function VoyageVesselList() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading, isFetching, isPlaceholderData } = useVoyageVessels({ page, search });

  const rows = data?.data || [];
  const pagination = data?.pagination;
  const open = (r) => router.push(`/voyages/vessel/${r.vesselId}`);

  return (
    <div className="animate-fadeIn min-w-0 w-full">
      <PageHeader
        title="Voyages"
        subtitle="Vessels with an open round and voyages — pick a vessel to see its rounds and voyages"
        action={<button type="button" onClick={() => router.push('/voyages?view=all')} className="text-[13px] font-semibold text-teal-600 hover:text-teal-800 transition">All voyages (incl. completed / cancelled) →</button>}
      />

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search vessel name or code…" />
        </div>
      </div>

      <div className="card overflow-hidden min-w-0">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : !rows.length ? (
          <EmptyState
            title={search ? 'No vessels match your search' : 'No vessels with open rounds and voyages'}
            message={search ? 'Try another name or code.' : 'A vessel appears here when it has a Planned or Active round with a voyage that is not completed or cancelled.'}
          />
        ) : (
          <div className="overflow-x-auto" style={{ opacity: isFetching && isPlaceholderData ? 0.55 : 1, transition: 'opacity .15s' }}>
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr className="table-header">
                  {['Vessel', 'Round', 'Next voyage', 'Vessel TEU', 'Booked TEU (all open voyages)', 'Peak load', ''].map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.vesselId} className="table-row cursor-pointer" onClick={() => open(r)}>
                    <td>
                      <span className="text-sm font-semibold text-gray-800">{r.vesselName}</span>
                      <span className="ml-1.5 mono text-[10px] text-gray-400">{r.vesselCode}</span>
                    </td>
                    <td title={r.rounds.map((x) => `${x.roundNumber}${x.roundName ? ` — ${x.roundName}` : ''} (${x.status})`).join('\n')}>
                      <span className="mono text-xs font-semibold text-gray-700">{r.primaryRound.roundNumber}</span>
                      {r.primaryRound.roundName && <span className="text-xs text-gray-400"> — {r.primaryRound.roundName}</span>}
                      <span className="ml-1.5 align-middle"><Badge label={r.primaryRound.status} /></span>
                      {r.extraRounds > 0 && <span className="ml-1.5 text-[11px] text-gray-400">+{r.extraRounds} more</span>}
                    </td>
                    <td>
                      <span className="mono text-xs font-bold text-teal-600">{r.nextVoyage?.label || '—'}</span>
                      {fmt(r.nextVoyage?.etd) && <span className="ml-1.5 text-[11px] text-gray-400">ETD {fmt(r.nextVoyage.etd)}</span>}
                      {r.extraVoyages > 0 && <span className="ml-1.5 text-[11px] text-gray-400">+{r.extraVoyages} more</span>}
                    </td>
                    <td><span className="mono text-xs text-gray-700">{r.capacity != null ? r.capacity.toLocaleString() : '—'}</span></td>
                    <td><span className="mono text-xs text-gray-700">{r.bookedTEU.toLocaleString()}</span></td>
                    <td><LoadBadge pct={r.peakUtilisationPct} /></td>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); open(r); }}
                        aria-label={`Open rounds and voyages of ${r.vesselName}`}
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
    </div>
  );
}
