'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { trackingService }  from '@/services/tracking.service';
import { vesselsService }   from '@/services/vessels.service';
import { servicesService }  from '@/services/services.service';
import { voyagesService }   from '@/services/voyages.service';
import { usePermission }    from '@/context/PermissionContext';
import { TRACKING_STATUS }  from '@/utils/constants';
import PageHeader            from '@/components/ui/PageHeader';
import Pagination            from '@/components/ui/Pagination';
import EmptyState            from '@/components/ui/EmptyState';
import LoadingSpinner        from '@/components/ui/LoadingSpinner';
import Modal                 from '@/components/ui/Modal';
import TrackingForm          from './TrackingForm';
import TrackingDetailModal   from './TrackingDetailModal';

const fmtDT = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  : '—';

const TRACKING_CHIP = {
  'At Port':    'bg-blue-100 text-blue-700',
  'Departed':   'bg-amber-100 text-amber-700',
  'In Transit': 'bg-purple-100 text-purple-700',
  'Arrived':    'bg-green-100 text-green-700',
  'Anchored':   'bg-gray-100 text-gray-600',
  'Delayed':    'bg-red-100 text-red-600',
};

const sc = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

export default function TrackingList() {
  const { can }        = usePermission();
  const qc             = useQueryClient();
  const searchParams   = useSearchParams();

  // Filters — pre-fill vesselId from URL query param (e.g. from vessel detail page)
  const [page,       setPage]       = useState(1);
  const [vesselId,   setVesselId]   = useState(searchParams.get('vesselId') || '');
  const [serviceId,  setServiceId]  = useState('');
  const [voyageId,   setVoyageId]   = useState('');
  const [status,     setStatus]     = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [search,     setSearch]     = useState('');

  // Modals
  const [addOpen,    setAddOpen]    = useState(false);
  const [viewEntry,  setViewEntry]  = useState(null);

  // Reset page when filters change
  const resetPage = () => setPage(1);

  // ── Dropdown data ────────────────────────────────────────────────────────────
  const { data: vesselsData } = useQuery({
    queryKey: ['vessels-dd'],
    queryFn:  () => vesselsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: svcData } = useQuery({
    queryKey: ['services-active-dropdown'],
    queryFn:  () => servicesService.listActive().then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: voyageData } = useQuery({
    queryKey: ['voyages-tracking-dd', serviceId],
    queryFn:  () => voyagesService.list({ limit: 300, ...(serviceId ? { serviceId } : {}) }).then(r => r.data.data),
    staleTime: 2 * 60 * 1000,
  });
  const vessels = vesselsData || [];
  const services = svcData || [];
  const voyages  = (voyageData || []).filter(v => v.status !== 'Cancelled');

  // ── Main list query ──────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['tracking-list', page, vesselId, serviceId, voyageId, status, dateFrom, dateTo, search],
    queryFn:  () => trackingService.list({ page, limit: 15, vesselId, serviceId, voyageId, status, dateFrom, dateTo, search }).then(r => r.data),
    keepPreviousData: true,
  });

  const entries    = data?.data       || [];
  const pagination = data?.pagination;

  // ── Pre-selected vessel name for display ────────────────────────────────────
  const selectedVessel = vesselId ? vessels.find(v => v._id === vesselId) : null;

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Vessel Tracking"
        subtitle={selectedVessel
          ? `Showing entries for ${selectedVessel.vesselCode} — ${selectedVessel.vesselName}`
          : 'All vessel position updates — append-only history'}
        action={can('tracking', 'create') && (
          <button onClick={() => setAddOpen(true)} className="btn btn-primary btn-md flex items-center gap-1.5">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" d="M12 5v14M5 12h14"/>
            </svg>
            Add Tracking
          </button>
        )}
      />

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="card p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

          {/* Vessel */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Vessel</p>
            <select value={vesselId} onChange={e => { setVesselId(e.target.value); resetPage(); }} className={sc}>
              <option value="">All Vessels</option>
              {vessels.map(v => (
                <option key={v._id} value={v._id}>{v.vesselCode} — {v.vesselName}</option>
              ))}
            </select>
          </div>

          {/* Service */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Service</p>
            <select value={serviceId} onChange={e => { setServiceId(e.target.value); setVoyageId(''); resetPage(); }} className={sc}>
              <option value="">All Services</option>
              {services.map(s => (
                <option key={s._id} value={s._id}>{s.serviceCode}</option>
              ))}
            </select>
          </div>

          {/* Voyage */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Voyage</p>
            <select value={voyageId} onChange={e => { setVoyageId(e.target.value); resetPage(); }} className={sc}>
              <option value="">All Voyages</option>
              {voyages.map(v => (
                <option key={v._id} value={v._id}>{v.voyageNumber}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Status</p>
            <select value={status} onChange={e => { setStatus(e.target.value); resetPage(); }} className={sc}>
              <option value="">All Statuses</option>
              {TRACKING_STATUS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">From</p>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); resetPage(); }}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>

          {/* Date To */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">To</p>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); resetPage(); }}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500" />
          </div>
        </div>

        {/* Search remarks + clear */}
        <div className="flex gap-3 mt-3 items-center">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage(); }}
            placeholder="Search remarks…"
            className="flex-1 text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal-500"
          />
          {(vesselId || serviceId || voyageId || status || dateFrom || dateTo || search) && (
            <button
              onClick={() => { setVesselId(''); setServiceId(''); setVoyageId(''); setStatus(''); setDateFrom(''); setDateTo(''); setSearch(''); resetPage(); }}
              className="text-xs text-gray-400 hover:text-gray-700 transition whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
          {isFetching && !isLoading && (
            <svg className="animate-spin w-4 h-4 text-teal-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          )}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : entries.length === 0 ? (
          <EmptyState title="No tracking entries found" subtitle="Try adjusting your filters or add a new position update" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="table-header">
                  {['#','Date/Time','Vessel','Voyage','Service','Port / Terminal','Status','Remarks','Recorded By',''].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr key={entry._id} className="table-row">
                    <td className="text-gray-400 text-xs w-8">
                      {((pagination?.page ?? 1) - 1) * 15 + idx + 1}
                    </td>
                    <td className="text-xs text-gray-600 whitespace-nowrap">{fmtDT(entry.lastUpdate)}</td>
                    <td>
                      <div>
                        <span className="mono text-xs font-bold text-gray-700">{entry.vesselId?.vesselCode}</span>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[120px]">{entry.vesselId?.vesselName}</p>
                      </div>
                    </td>
                    <td>
                      <span className="mono text-xs font-semibold text-teal-600">{entry.voyageId?.voyageNumber || '—'}</span>
                    </td>
                    <td>
                      <span className="mono text-xs text-gray-500">{entry.serviceId?.serviceCode || '—'}</span>
                    </td>
                    <td>
                      <div>
                        <span className="text-xs font-medium text-gray-700">{entry.portId?.name || '—'}</span>
                        {entry.portId?.code && <span className="mono text-[10px] text-gray-400 ml-1">{entry.portId.code}</span>}
                        {entry.terminalId?.name && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{entry.terminalId.name}</p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TRACKING_CHIP[entry.status] || 'bg-gray-100 text-gray-600'}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="text-xs text-gray-400 max-w-[160px]">
                      {entry.remarks
                        ? <span className="truncate block max-w-[160px]" title={entry.remarks}>{entry.remarks}</span>
                        : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="text-xs text-gray-400">
                      {entry.createdBy?.name || '—'}
                    </td>
                    <td>
                      <button
                        onClick={() => setViewEntry(entry)}
                        className="text-xs font-medium text-teal-600 hover:text-teal-800 transition"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            {pagination.total} entr{pagination.total !== 1 ? 'ies' : 'y'} total
          </p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* ── Add Tracking Modal ──────────────────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Tracking Entry" size="lg">
        {addOpen && (
          <TrackingForm
            onEntryAdded={(voyageId) => {
              setAddOpen(false);
              qc.invalidateQueries(['tracking-list']);
            }}
          />
        )}
      </Modal>

      {/* ── Entry Detail Modal ──────────────────────────────────────── */}
      <TrackingDetailModal
        entry={viewEntry}
        open={!!viewEntry}
        onClose={() => setViewEntry(null)}
      />
    </div>
  );
}
