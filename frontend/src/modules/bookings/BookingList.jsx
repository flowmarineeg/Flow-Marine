'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { bookingsService } from '@/services/bookings.service';
import { voyagesService }   from '@/services/voyages.service';
import { useBookingLookups } from '@/hooks/useBookingLookups';
import { usePermission }    from '@/context/PermissionContext';
import { BOOKING_STATUS }   from '@/utils/constants';
import { getVoyageLabel }   from '@/utils/voyageLabel';
import PageHeader    from '@/components/ui/PageHeader';
import Button        from '@/components/ui/Button';
import SearchBar     from '@/components/ui/SearchBar';
import Pagination    from '@/components/ui/Pagination';
import EmptyState    from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FormPage         from '@/components/ui/FormPage';
import ExportButton  from '@/components/ui/ExportButton';
import BookingForm   from '@/modules/bookings/BookingForm';
import BookingVesselList from '@/modules/bookings/BookingVesselList';
import BookingRoundList  from '@/modules/bookings/BookingRoundList';
import DrillCrumb        from '@/components/ui/DrillCrumb';
import BookingsTable from '@/modules/bookings/BookingsTable';
import ManualBookingsTable from '@/modules/bookings/ManualBookingsTable';
import DischargeListExportModal from '@/modules/bookings/DischargeListExportModal';

const fmt      = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// URL <-> section keys. The section lives in the URL (?tab=&vessel=&round=&voyage=&closed=) so Back goes one level up.
const URL_TO_TAB = { estimated: 'manual', operational: 'detail', discharged: 'discharged', remaining: 'remaining' };
const TAB_TO_URL = { manual: 'estimated', detail: 'operational', discharged: 'discharged', remaining: 'remaining' };

export default function BookingList() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const { can } = usePermission();

  const searchParams = useSearchParams();
  const activeTab  = URL_TO_TAB[searchParams.get('tab')] || 'manual';
  const summaryTab = TAB_TO_URL[activeTab];
  const vesselId   = searchParams.get('vessel') || '';
  const roundId    = searchParams.get('round') || '';
  const voyageFilter = searchParams.get('voyage') || '';
  const closedRaw  = searchParams.get('closed');
  // "Include completed rounds": ON by default for Discharged / Remaining, OFF for Estimated / Operational (owner decision D6)
  const includeClosed = closedRaw === '1' ? true : closedRaw === '0' ? false : (summaryTab === 'discharged' || summaryTab === 'remaining');
  const level = roundId ? 3 : vesselId ? 2 : 1;
  const go = (patch) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === '') p.delete(k); else p.set(k, v); }
    router.push(`/bookings?${p.toString()}`);
  };

  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [status,       setStatus]       = useState('');
  const [agentId,      setAgentId]      = useState('');
  const [partnerId,    setPartnerId]    = useState(''); // staff filter: bookings given to us by a partner
  const [selected,     setSelected]     = useState([]);
  const [modal,        setModal]        = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null); // FL-05: a Final Loading booking to cancel
  const [manualDeleteTarget, setManualDeleteTarget] = useState(null);
  const [dischargeOpen, setDischargeOpen] = useState(false); // Sprint 027
  const [bulkConfirm,   setBulkConfirm]   = useState(false); // Sprint 047 — Delete Selected
  const [manualSelected,    setManualSelected]    = useState([]); // Sprint 047
  const [manualBulkConfirm, setManualBulkConfirm] = useState(false); // Sprint 047

  // Post-audit fix (system-audit-2026-8-3.md §3.4) — `selected` was shared
  // across the detail/discharged/remaining tabs (same table/state, scoped
  // only by dischargeStatus) with nothing clearing it on tab switch, so a
  // "Delete Selected" click after switching tabs could fire against ids
  // from a table the user could no longer see. Reset both selections on
  // every tab change, same as the existing reset-on-search-change pattern
  // already used below. Adjusted during render (React's own recommended
  // pattern for "reset state when a value changes") rather than in a
  // useEffect, which would cost an extra render-after-commit and trip the
  // react-hooks/set-state-in-effect lint rule.
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab + '|' + roundId);
  if (activeTab + '|' + roundId !== prevActiveTab) {
    setPrevActiveTab(activeTab + '|' + roundId);
    setSelected([]);
    setManualSelected([]);
    setPage(1);
    setManualPage(1);
  }

  // Layer 2 — 'detail' (Operational), 'discharged' and 'remaining' (Sprint 045) all
  // share this same query/table, just scoped by dischargeStatus.
  const dischargeStatusParam = activeTab === 'discharged' ? 'Discharged' : activeTab === 'remaining' ? 'Remaining' : '';
  const { data, isLoading } = useQuery({
    queryKey: ['bookings', page, search, status, roundId, voyageFilter, agentId, partnerId, dischargeStatusParam],
    queryFn:  () => bookingsService.list({ page, limit: 20, search, status, roundId, voyageId: voyageFilter, agentId, partnerId, dischargeStatus: dischargeStatusParam }).then(r => r.data),
    enabled:  ['detail', 'discharged', 'remaining'].includes(activeTab) && !!roundId,
  });

  // Layer 1 — Manual Bookings
  const [manualPage,     setManualPage]     = useState(1);
  const [manualSearch,   setManualSearch]   = useState('');
  const [manualStatus,   setManualStatus]   = useState('');
  const [manualAgentId,  setManualAgentId]  = useState('');
  const [manualKind,     setManualKind]     = useState(''); // '' | Estimate | Allocation

  const { data: manualData, isLoading: manualLoading } = useQuery({
    queryKey: ['manual-bookings', manualPage, manualSearch, manualStatus, roundId, voyageFilter, manualAgentId, partnerId, manualKind],
    queryFn:  () => bookingsService.listManual({ page: manualPage, limit: 20, search: manualSearch, status: manualStatus, roundId, voyageId: voyageFilter, agentId: manualAgentId, partnerId, kind: manualKind }).then(r => r.data),
    enabled:  activeTab === 'manual' && !!roundId,
  });

  // Partner users only reach /bookings, so every pick-list comes from the lookups endpoint.
  const lookups = useBookingLookups();
  const isPartnerUser = lookups.isPartnerUser;
  const agents        = lookups.agents;
  const partners      = lookups.partners;

  // Names for the breadcrumb on levels 2 and 3 (any round of the vessel, completed ones too, so a deep link always resolves).
  const ctxQ = useQuery({
    queryKey: ['booking-ctx', summaryTab, vesselId, roundId],
    queryFn:  () => bookingsService.roundSummary({ tab: summaryTab, ...(roundId ? { roundId } : { vesselId }), includeClosed: 1, limit: 100 }).then(r => r.data.data),
    enabled:  level > 1,
    staleTime: 60 * 1000,
  });
  const ctxRound  = ctxQ.data?.find(r => r.roundId === roundId) || null;
  const ctxVessel = ctxQ.data?.[0] || null;
  const crumbVesselId = vesselId || ctxRound?.vesselId || '';

  // Voyage filter on level 3: the voyages of the opened round (staff only; partner users cannot read voyages).
  const canListVoyages = !isPartnerUser && can('voyages', 'read');
  const { data: roundVoyages } = useQuery({
    queryKey: ['round-voyages-filter', roundId],
    queryFn:  () => voyagesService.list({ roundId, limit: 200 }).then(r => r.data.data),
    enabled:  level === 3 && canListVoyages,
    staleTime: 60 * 1000,
  });

  const crumb = level === 1 ? null : (
    <DrillCrumb items={[
      { label: 'Vessels', onClick: () => go({ vessel: null, round: null, voyage: null }) },
      level === 3 && crumbVesselId
        ? { label: ctxVessel?.vesselName || 'Vessel', onClick: () => go({ vessel: crumbVesselId, round: null, voyage: null }) }
        : { label: ctxVessel?.vesselName || 'Vessel' },
      ...(level === 3 ? [{ label: ctxRound ? `${ctxRound.roundNumber}${ctxRound.roundName ? ` — ${ctxRound.roundName}` : ''}` : 'Round' }] : []),
    ]} />
  );

  const sc = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

  // The same search / agent / partner / status narrow the vessel and round rows as the table below
  const closedToggle = (
    <label className="flex items-center gap-1.5 text-[13px] text-gray-600 cursor-pointer select-none">
      <input type="checkbox" checked={includeClosed} onChange={e => go({ closed: e.target.checked ? '1' : '0' })} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
      Include completed rounds
    </label>
  );
  const voyageSelect = level === 3 && canListVoyages && (
    <select value={voyageFilter} onChange={e => { go({ voyage: e.target.value }); setPage(1); setManualPage(1); }} className={sc}>
      <option value="">All voyages of the round</option>
      {(roundVoyages || []).map(v => <option key={v._id} value={v._id}>{getVoyageLabel(v)}</option>)}
    </select>
  );

  const cancelMutation = useMutation({
    mutationFn: (id) => bookingsService.update(id, { status: 'Cancelled' }),
    onSuccess: () => { toast.success('Booking cancelled'); qc.invalidateQueries(['bookings']); setCancelTarget(null); },
    onError:   (e)  => { showErrorToast(e, 'update'); setCancelTarget(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => bookingsService.remove(id),
    onSuccess: () => { toast.success('Booking deleted'); qc.invalidateQueries(['bookings']); setDeleteTarget(null); setSelected([]); },
    onError:   (e)  => showErrorToast(e, 'delete'),
  });

  const manualDeleteMutation = useMutation({
    mutationFn: (id) => bookingsService.removeManual(id),
    onSuccess: () => { toast.success('Estimated booking deleted'); qc.invalidateQueries(['manual-bookings']); setManualDeleteTarget(null); },
    onError:   (e)  => showErrorToast(e, 'delete'),
  });

  // Sprint 047 — bulk "Delete Selected": loop the existing single-delete
  // call per id, sequentially, so one failure doesn't stop the rest.
  const bulkDeleteSummary = (deletedCount, failed) => {
    if (failed.length === 0) {
      toast.success(`${deletedCount} booking${deletedCount !== 1 ? 's' : ''} deleted`);
    } else {
      toast.error(
        <div>
          <p className="font-semibold text-[13px]">{deletedCount} deleted, {failed.length} failed</p>
          <ul className="mt-1 text-[11px] list-disc list-inside space-y-0.5">
            {failed.map((f, i) => <li key={i}>{f.reason}</li>)}
          </ul>
        </div>
      );
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      const failed = [];
      let deletedCount = 0;
      for (const id of ids) {
        try {
          await bookingsService.remove(id);
          deletedCount++;
        } catch (e) {
          failed.push({ id, reason: e?.response?.data?.message || e?.message || 'Delete failed' });
        }
      }
      return { deletedCount, failed };
    },
    onSuccess: ({ deletedCount, failed }) => {
      qc.invalidateQueries(['bookings']);
      setSelected([]);
      setBulkConfirm(false);
      bulkDeleteSummary(deletedCount, failed);
    },
  });

  const manualBulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      const failed = [];
      let deletedCount = 0;
      for (const id of ids) {
        try {
          await bookingsService.removeManual(id);
          deletedCount++;
        } catch (e) {
          failed.push({ id, reason: e?.response?.data?.message || e?.message || 'Delete failed' });
        }
      }
      return { deletedCount, failed };
    },
    onSuccess: ({ deletedCount, failed }) => {
      qc.invalidateQueries(['manual-bookings']);
      setManualSelected([]);
      setManualBulkConfirm(false);
      bulkDeleteSummary(deletedCount, failed);
    },
  });

  const bookings   = data?.data || [];
  const pagination = data?.pagination;

  const toggleSelect = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll    = ()   => setSelected(p => p.length === bookings.length ? [] : bookings.map(b => b._id));

  const manualBookings = manualData?.data || [];
  const manualToggleSelect = (id) => setManualSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const manualToggleAll    = ()   => setManualSelected(p => p.length === manualBookings.length ? [] : manualBookings.map(m => m._id));

  return (
    /* min-w-0 prevents the flex child from reporting its intrinsic table width
       to the parent, which is what caused the page-level overflow */
    <div className="animate-fadeIn min-w-0 w-full">

      <PageHeader
        title="Bookings"
        subtitle="Manage cargo bookings on voyages"
        action={
          can('bookings', 'create') && (
            <div className="flex gap-2 flex-wrap">
              {can('bookings', 'import') && (
                <Button variant="secondary" onClick={() => router.push('/bookings/import')}>↑ Import</Button>
              )}
              <div className="flex">
                <Button onClick={() => setModal('create')}>+ New Booking</Button>
                <Button
                  variant="secondary"
                  onClick={() => router.push('/bookings/new-manual')}
                  title="New Estimated Booking"
                  className="ml-1"
                >
                  + Estimated
                </Button>
              </div>
            </div>
          )
        }
      />

      {/* ── Tab strip ──────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 mb-4">
        {[
          { key: 'manual', label: 'Estimated Bookings' },
          { key: 'detail', label: 'Operational Bookings' },
          { key: 'discharged', label: 'Discharged' },
          { key: 'remaining', label: 'Remaining' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => go({ tab: TAB_TO_URL[t.key], vessel: null, round: null, voyage: null, closed: null })}
            className={`px-5 py-2.5 text-[13px] font-semibold border-b-2 transition ${
              activeTab === t.key ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DETAIL / DISCHARGED / REMAINING TABS (Sprint 045: same table, scoped by dischargeStatus) ── */}
      {['detail', 'discharged', 'remaining'].includes(activeTab) && (<>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 mb-4">
          <div className="flex-1 min-w-[200px]">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); setSelected([]); }} placeholder="Search booking no, shipper, consignee…" />
          </div>
          {level < 3 ? closedToggle : voyageSelect}
          <select value={agentId} onChange={e => { setAgentId(e.target.value); setPage(1); }} className={sc}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode}</option>)}
          </select>
          {!isPartnerUser && (
            <select value={partnerId} onChange={e => { setPartnerId(e.target.value); setPage(1); setManualPage(1); }} className={sc}>
              <option value="">All Partners</option>
              {partners.map(p => <option key={p._id} value={p._id}>{p.code}</option>)}
            </select>
          )}
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={sc}>
            <option value="">All Statuses</option>
            {BOOKING_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {!isPartnerUser && <ExportButton module="bookings" filters={{ roundId, voyageId: voyageFilter, agentId, status }} selectedIds={selected} onClear={() => setSelected([])} />}
          {/* Sprint 047 — bulk delete */}
          {selected.length > 0 && can('bookings', 'delete') && (
            <Button variant="danger" size="sm" onClick={() => setBulkConfirm(true)}>
              Delete Selected ({selected.length})
            </Button>
          )}
          {/* Sprint 027 — Discharge List export */}
          {(!isPartnerUser && can('bookings', 'export') && can('export', 'read')) && (
            <button
              onClick={() => setDischargeOpen(true)}
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Discharge List
            </button>
          )}
        </div>

        {level < 3 ? (<>
          {crumb}
          {level === 1 ? (
            <BookingVesselList
              key={`${summaryTab}|${search}|${agentId}|${partnerId}|${status}|${includeClosed}`}
              tab={summaryTab}
              filters={{ search, agentId, partnerId, status }}
              includeClosed={includeClosed}
              onOpen={(r) => go({ vessel: r.vesselId, round: null, voyage: null })}
            />
          ) : (
            <BookingRoundList
              key={`${summaryTab}|${vesselId}|${search}|${agentId}|${partnerId}|${status}|${includeClosed}`}
              tab={summaryTab}
              vesselId={vesselId}
              filters={{ search, agentId, partnerId, status }}
              includeClosed={includeClosed}
              onOpen={(r) => go({ vessel: vesselId, round: r.roundId, voyage: null })}
            />
          )}
        </>) : (<>
        {crumb}

        {/* Table — overflow-x-auto clips the table, min-w-0 on the card prevents page blowout */}
        <div className="card overflow-hidden min-w-0">
          {isLoading ? (
            <LoadingSpinner fullPage />
          ) : !bookings.length ? (
            <EmptyState
              title={activeTab === 'discharged' ? 'No discharged bookings found' : activeTab === 'remaining' ? 'No remaining bookings found' : 'No bookings found'}
              message={
                activeTab === 'discharged'
                  ? 'Bookings appear here once a Discharge import matches their container on this voyage.'
                  : activeTab === 'remaining'
                  ? 'Bookings appear here when Final Loading expected them to discharge on a voyage but a Discharge import did not find them.'
                  : 'Create a booking to attach cargo to a voyage.'
              }
            />
          ) : (
            <BookingsTable
              rows={bookings}
              onView={(b) => router.push(`/bookings/${b._id}`)}
              selection={{ selected, onToggle: toggleSelect, onToggleAll: toggleAll }}
              onEdit={can('bookings', 'update') ? (b) => setModal({ edit: b }) : undefined}
              onDelete={can('bookings', 'delete') ? setDeleteTarget : undefined}
              onCancelLoaded={can('bookings', 'update') ? setCancelTarget : undefined}
            />
          )}
        </div>

        {/* Footer */}
        {pagination?.total > 0 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              {pagination.total} booking{pagination.total !== 1 ? 's' : ''} total
              {selected.length > 0 && <span className="text-teal-600 font-medium"> · {selected.length} selected</span>}
            </p>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </div>
        )}
        </>)}
      </>)}

      {/* ── MANUAL TAB ─────────────────────────────────────────────── */}
      {activeTab === 'manual' && (<>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 mb-4">
          <div className="flex-1 min-w-[200px]">
            <SearchBar value={manualSearch} onChange={v => { setManualSearch(v); setManualPage(1); }} placeholder="Search MB-number…" />
          </div>
          {level < 3 ? closedToggle : voyageSelect}
          <select value={manualAgentId} onChange={e => { setManualAgentId(e.target.value); setManualPage(1); }} className={sc}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode}</option>)}
          </select>
          <select value={manualKind} onChange={e => { setManualKind(e.target.value); setManualPage(1); }} className={sc}>
            <option value="">All Types</option>
            <option value="Estimate">Estimates</option>
            <option value="Allocation">Allocations</option>
          </select>
          <select value={manualStatus} onChange={e => { setManualStatus(e.target.value); setManualPage(1); }} className={sc}>
            <option value="">All Statuses</option>
            {BOOKING_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {!isPartnerUser && <ExportButton module="manualBookings" filters={{ roundId, voyageId: voyageFilter, agentId: manualAgentId, status: manualStatus }} selectedIds={[]} />}
          {/* Sprint 047 — bulk delete */}
          {manualSelected.length > 0 && can('bookings', 'delete') && (
            <Button variant="danger" size="sm" onClick={() => setManualBulkConfirm(true)}>
              Delete Selected ({manualSelected.length})
            </Button>
          )}
        </div>

        {level < 3 ? (<>
          {crumb}
          {level === 1 ? (
            <BookingVesselList
              key={`manual|${manualSearch}|${manualAgentId}|${partnerId}|${manualStatus}|${includeClosed}`}
              tab="estimated"
              filters={{ search: manualSearch, agentId: manualAgentId, partnerId, status: manualStatus }}
              includeClosed={includeClosed}
              onOpen={(r) => go({ vessel: r.vesselId, round: null, voyage: null })}
            />
          ) : (
            <BookingRoundList
              key={`manual|${vesselId}|${manualSearch}|${manualAgentId}|${partnerId}|${manualStatus}|${includeClosed}`}
              tab="estimated"
              vesselId={vesselId}
              filters={{ search: manualSearch, agentId: manualAgentId, partnerId, status: manualStatus }}
              includeClosed={includeClosed}
              onOpen={(r) => go({ vessel: vesselId, round: r.roundId, voyage: null })}
            />
          )}
        </>) : (<>
        {crumb}

        <div className="card overflow-hidden min-w-0">
          {manualLoading ? (
            <LoadingSpinner fullPage />
          ) : !manualBookings.length ? (
            <EmptyState title="No estimated bookings found" message="Create an estimated booking to record commercial cargo reservations before container numbers are available." />
          ) : (
            <ManualBookingsTable
              rows={manualBookings}
              onView={(m) => router.push(`/bookings/manual/${m._id}`)}
              selection={{ selected: manualSelected, onToggle: manualToggleSelect, onToggleAll: manualToggleAll }}
              onDelete={can('bookings', 'delete') ? setManualDeleteTarget : undefined}
            />
          )}
        </div>

        {manualData?.pagination?.total > 0 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              {manualData.pagination.total} estimated booking{manualData.pagination.total !== 1 ? 's' : ''}
              {manualSelected.length > 0 && <span className="text-teal-600 font-medium"> · {manualSelected.length} selected</span>}
            </p>
            <Pagination page={manualData.pagination.page} totalPages={manualData.pagination.totalPages} onPageChange={setManualPage} />
          </div>
        )}
        </>)}
      </>)}

      {/* ── Create / Edit Modal ─────────────────────────────────────── */}
      <FormPage open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'New Booking' : `Edit Booking — ${modal?.edit?.bookingNumber || ''}`} size="lg">
        {modal && (
          <BookingForm
            item={modal?.edit || null}
            onSuccess={(result) => { setModal(null); if (!modal?.edit && result?._id) router.push(`/bookings/${result._id}`); }}
            onCancel={() => setModal(null)}
          />
        )}
      </FormPage>

      {/* ── Delete confirm ──────────────────────────────────────────── */}
      {/* ── Cancel a Final Loading booking (FL-05) ──────────────────── */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelMutation.mutate(cancelTarget._id)}
        loading={cancelMutation.isPending}
        title="Cancel Booking"
        message={`Cancel booking "${cancelTarget?.bookingNumber}"? It is already on the Final Loading list. This is refused if it is on a live invoice.`}
        confirmLabel="Cancel Booking"
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
        title="Delete Booking"
        message={`Delete booking "${deleteTarget?.bookingNumber}"? This is permanent.`}
      />

      {/* ── Manual booking delete confirm ─────────────────────────────── */}
      <ConfirmDialog
        open={!!manualDeleteTarget}
        onClose={() => setManualDeleteTarget(null)}
        onConfirm={() => manualDeleteMutation.mutate(manualDeleteTarget._id)}
        loading={manualDeleteMutation.isPending}
        title="Delete Estimated Booking"
        message={`Delete estimated booking "${manualDeleteTarget?.bookingNumber}"? This is permanent.`}
      />

      {/* ── Bulk delete confirm — Operational/Discharged/Remaining ────── */}
      <ConfirmDialog
        open={bulkConfirm}
        onClose={() => setBulkConfirm(false)}
        onConfirm={() => bulkDeleteMutation.mutate(selected)}
        loading={bulkDeleteMutation.isPending}
        title="Delete Selected Bookings"
        message={`Delete ${selected.length} selected booking${selected.length !== 1 ? 's' : ''}? This is permanent. Any booking that can't be deleted will be reported and skipped.`}
        confirmLabel="Delete Selected"
      />

      {/* ── Bulk delete confirm — Estimated/Manual ─────────────────────── */}
      <ConfirmDialog
        open={manualBulkConfirm}
        onClose={() => setManualBulkConfirm(false)}
        onConfirm={() => manualBulkDeleteMutation.mutate(manualSelected)}
        loading={manualBulkDeleteMutation.isPending}
        title="Delete Selected Estimated Bookings"
        message={`Delete ${manualSelected.length} selected estimated booking${manualSelected.length !== 1 ? 's' : ''}? This is permanent. Any booking that can't be deleted will be reported and skipped.`}
        confirmLabel="Delete Selected"
      />

      {/* Discharge list by POL -> POD (screen + Excel), reworked 2026-11-10 */}
      <DischargeListExportModal
        open={dischargeOpen}
        onClose={() => setDischargeOpen(false)}
      />
    </div>
  );
}
