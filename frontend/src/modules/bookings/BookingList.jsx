'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { bookingsService } from '@/services/bookings.service';
import { voyagesService }   from '@/services/voyages.service';
import { agentsService }    from '@/services/agents.service';
import { useRounds }        from '@/hooks/useRounds';
import { usePermission }    from '@/context/PermissionContext';
import { BOOKING_STATUS }   from '@/utils/constants';
import PageHeader    from '@/components/ui/PageHeader';
import Button        from '@/components/ui/Button';
import Badge         from '@/components/ui/Badge';
import SearchBar     from '@/components/ui/SearchBar';
import Pagination    from '@/components/ui/Pagination';
import EmptyState    from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal         from '@/components/ui/Modal';
import ExportButton  from '@/components/ui/ExportButton';
import BookingForm   from '@/modules/bookings/BookingForm';
import DischargeListExportModal from '@/modules/bookings/DischargeListExportModal';

const fmt      = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';

export default function BookingList() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const { can } = usePermission();

  const [activeTab,    setActiveTab]    = useState('manual');
  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [status,       setStatus]       = useState('');
  const [roundId,      setRoundId]      = useState('');
  const [voyageId,     setVoyageId]     = useState('');
  const [agentId,      setAgentId]      = useState('');
  const [selected,     setSelected]     = useState([]);
  const [modal,        setModal]        = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [manualDeleteTarget, setManualDeleteTarget] = useState(null);
  const [dischargeOpen, setDischargeOpen] = useState(false); // Sprint 027

  // Layer 2
  const { data, isLoading } = useQuery({
    queryKey: ['bookings', page, search, status, voyageId, agentId],
    queryFn:  () => bookingsService.list({ page, limit: 20, search, status, voyageId, agentId }).then(r => r.data),
    enabled:  activeTab === 'detail',
  });

  // Layer 1 — Manual Bookings
  const [manualPage,     setManualPage]     = useState(1);
  const [manualSearch,   setManualSearch]   = useState('');
  const [manualStatus,   setManualStatus]   = useState('');
  const [manualRoundId,  setManualRoundId]  = useState(''); // Sprint 030
  const [manualVoyageId, setManualVoyageId] = useState(''); // Sprint 030
  const [manualAgentId,  setManualAgentId]  = useState('');

  const { data: manualData, isLoading: manualLoading } = useQuery({
    queryKey: ['manual-bookings', manualPage, manualSearch, manualStatus, manualVoyageId, manualAgentId],
    queryFn:  () => bookingsService.listManual({ page: manualPage, limit: 20, search: manualSearch, status: manualStatus, voyageId: manualVoyageId, agentId: manualAgentId }).then(r => r.data),
    enabled:  activeTab === 'manual',
  });

  // Sprint 030: Round → Voyage cascading filters (both tabs)
  const { rounds } = useRounds();
  const { data: voyageData } = useQuery({
    queryKey: ['voyages-dropdown', roundId],
    queryFn:  () => voyagesService.list({ roundId, limit: 200 }).then(r => r.data.data),
    enabled:  !!roundId,
  });
  const { data: manualVoyageData } = useQuery({
    queryKey: ['voyages-dropdown', manualRoundId],
    queryFn:  () => voyagesService.list({ roundId: manualRoundId, limit: 200 }).then(r => r.data.data),
    enabled:  !!manualRoundId,
  });
  const { data: agentData  } = useQuery({ queryKey: ['agents-dropdown'],  queryFn: () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data) });
  const voyages       = voyageData       || [];
  const manualVoyages = manualVoyageData || [];
  const agents         = agentData  || [];

  // Discharge List export modal needs its own unfiltered voyage list —
  // it is a standalone export tool, independent of the Round/Voyage list filters above.
  const { data: allVoyageData } = useQuery({
    queryKey: ['voyages-dropdown-all'],
    queryFn:  () => voyagesService.list({ limit: 200 }).then(r => r.data.data),
    enabled:  dischargeOpen,
  });
  const allVoyages = allVoyageData || [];

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

  const bookings   = data?.data || [];
  const pagination = data?.pagination;

  const toggleSelect = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll    = ()   => setSelected(p => p.length === bookings.length ? [] : bookings.map(b => b._id));

  const sc = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

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
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2.5 text-[13px] font-semibold border-b-2 transition ${
              activeTab === t.key ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DETAIL TAB ─────────────────────────────────────────────── */}
      {activeTab === 'detail' && (<>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 mb-4">
          <div className="flex-1 min-w-[200px]">
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); setSelected([]); }} placeholder="Search booking no, shipper, consignee…" />
          </div>
          <select value={roundId} onChange={e => { setRoundId(e.target.value); setVoyageId(''); setPage(1); }} className={sc}>
            <option value="">All Rounds</option>
            {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
          </select>
          <select value={voyageId} onChange={e => { setVoyageId(e.target.value); setPage(1); }} disabled={!roundId} className={`${sc} disabled:opacity-50`}>
            <option value="">{roundId ? 'All Voyages' : 'Select a round first'}</option>
            {voyages.map(v => <option key={v._id} value={v._id}>{v.voyageNumber} ({v.voyageName || 'unnamed'})</option>)}
          </select>
          <select value={agentId} onChange={e => { setAgentId(e.target.value); setPage(1); }} className={sc}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode}</option>)}
          </select>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={sc}>
            <option value="">All Statuses</option>
            {BOOKING_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ExportButton module="bookings" filters={{ voyageId, agentId, status }} selectedIds={selected} onClear={() => setSelected([])} />
          {/* Sprint 027 — Discharge List export */}
          {(can('bookings', 'export') && can('export', 'read')) && (
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

        {/* Table — overflow-x-auto clips the table, min-w-0 on the card prevents page blowout */}
        <div className="card overflow-hidden min-w-0">
          {isLoading ? (
            <LoadingSpinner fullPage />
          ) : !bookings.length ? (
            <EmptyState title="No bookings found" message="Create a booking to attach cargo to a voyage." />
          ) : (
            <div className="overflow-x-auto">
              {/* minWidth ensures the table scrolls internally rather than expanding the page */}
              <table className="w-full border-collapse" style={{ minWidth: 800 }}>
                <thead>
                  <tr className="table-header">
                    <th className="w-10 px-4 py-2.5">
                      <input type="checkbox" checked={selected.length === bookings.length && bookings.length > 0} onChange={toggleAll} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
                    </th>
                    {['Booking No','Voyage','Agent','Shipper / Consignee','Container','Total Freight','Status','Actions'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => (
                    <tr key={b._id} className="table-row">
                      <td className="px-4">
                        <input type="checkbox" checked={selected.includes(b._id)} onChange={() => toggleSelect(b._id)} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
                      </td>
                      <td>
                        <button onClick={() => router.push(`/bookings/${b._id}`)} className="mono text-xs font-bold text-teal-600 hover:text-teal-800 transition whitespace-nowrap">
                          {b.bookingNumber}
                        </button>
                      </td>
                      <td><span className="mono text-xs font-semibold text-gray-600 whitespace-nowrap">{b.voyageId?.voyageNumber}</span><p className="text-[11px] text-gray-400">{b.voyageId?.voyageName || '(unnamed)'}</p></td>
                      <td><span className="text-xs text-gray-600">{b.agentId?.agentName}</span></td>
                      <td>
                        <p className="text-xs font-medium text-gray-700 truncate max-w-[140px]">{b.shipper || '—'}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[140px]">{b.consignee || '—'}</p>
                      </td>
                      <td>
                        <span className="mono text-xs text-gray-600 whitespace-nowrap">
                          {b.containerTypeId?.code}<span className="text-gray-400 ml-1">{b.containerTypeId?.size}</span>
                        </span>
                      </td>
                      <td><span className="mono text-xs font-semibold text-teal-700 whitespace-nowrap">{fmtMoney(b.totalFreight)}</span></td>
                      <td><Badge label={b.status} /></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button onClick={() => router.push(`/bookings/${b._id}`)} className="text-xs font-medium text-teal-600 hover:text-teal-800 transition whitespace-nowrap">View</button>
                          {can('bookings', 'update') && !['Cancelled','Final Loading'].includes(b.status) && (
                            <button onClick={() => setModal({ edit: b })} className="text-xs font-medium text-gray-500 hover:text-gray-800 transition">Edit</button>
                          )}
                          {can('bookings', 'delete') && (
                            <button onClick={() => setDeleteTarget(b)} className="text-xs font-medium text-red-400 hover:text-red-600 transition">Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* ── MANUAL TAB ─────────────────────────────────────────────── */}
      {activeTab === 'manual' && (<>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 mb-4">
          <div className="flex-1 min-w-[200px]">
            <SearchBar value={manualSearch} onChange={v => { setManualSearch(v); setManualPage(1); }} placeholder="Search MB-number…" />
          </div>
          <select value={manualRoundId} onChange={e => { setManualRoundId(e.target.value); setManualVoyageId(''); setManualPage(1); }} className={sc}>
            <option value="">All Rounds</option>
            {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
          </select>
          <select value={manualVoyageId} onChange={e => { setManualVoyageId(e.target.value); setManualPage(1); }} disabled={!manualRoundId} className={`${sc} disabled:opacity-50`}>
            <option value="">{manualRoundId ? 'All Voyages' : 'Select a round first'}</option>
            {manualVoyages.map(v => <option key={v._id} value={v._id}>{v.voyageNumber} ({v.voyageName || 'unnamed'})</option>)}
          </select>
          <select value={manualAgentId} onChange={e => { setManualAgentId(e.target.value); setManualPage(1); }} className={sc}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode}</option>)}
          </select>
          <select value={manualStatus} onChange={e => { setManualStatus(e.target.value); setManualPage(1); }} className={sc}>
            <option value="">All Statuses</option>
            {BOOKING_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ExportButton module="manualBookings" filters={{ voyageId: manualVoyageId, agentId: manualAgentId, status: manualStatus }} selectedIds={[]} />
        </div>

        <div className="card overflow-hidden min-w-0">
          {manualLoading ? (
            <LoadingSpinner fullPage />
          ) : !manualData?.data?.length ? (
            <EmptyState title="No estimated bookings found" message="Create an estimated booking to record commercial cargo reservations before container numbers are available." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 700 }}>
                <thead>
                  <tr className="table-header">
                    {['Booking No','Voyage','Agent','POL → POD','Rows','Total TEU','Total Freight','Status','Actions'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(manualData?.data || []).map(m => (
                    <tr key={m._id} className="table-row">
                      <td>
                        <button onClick={() => router.push(`/bookings/manual/${m._id}`)} className="mono text-xs font-bold text-purple-600 hover:text-purple-800 transition whitespace-nowrap">
                          {m.bookingNumber}
                        </button>
                      </td>
                      <td><span className="mono text-xs font-semibold text-gray-600 whitespace-nowrap">{m.voyageId?.voyageNumber}</span><p className="text-[11px] text-gray-400">{m.voyageId?.voyageName || '(unnamed)'}</p></td>
                      <td><span className="text-xs text-gray-600">{m.agentId?.agentName}</span></td>
                      <td className="text-xs text-gray-600 whitespace-nowrap">
                        {m.polId?.code || m.polId?.name || '—'} → {m.podId?.code || m.podId?.name || '—'}
                      </td>
                      <td className="text-xs text-gray-600">{m.cargoRows?.length || 0}</td>
                      <td className="mono text-xs text-gray-600">{m.totalTEU?.toLocaleString() || '—'}</td>
                      <td><span className="mono text-xs font-semibold text-teal-700 whitespace-nowrap">{fmtMoney(m.totalFreight)}</span></td>
                      <td><Badge label={m.status} /></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button onClick={() => router.push(`/bookings/manual/${m._id}`)} className="text-xs font-medium text-teal-600 hover:text-teal-800 transition whitespace-nowrap">View</button>
                          {can('bookings', 'delete') && (
                            <button onClick={() => setManualDeleteTarget(m)} className="text-xs font-medium text-red-400 hover:text-red-600 transition">Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {manualData?.pagination?.total > 0 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">{manualData.pagination.total} estimated booking{manualData.pagination.total !== 1 ? 's' : ''}</p>
            <Pagination page={manualData.pagination.page} totalPages={manualData.pagination.totalPages} onPageChange={setManualPage} />
          </div>
        )}
      </>)}

      {/* ── Create / Edit Modal ─────────────────────────────────────── */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'New Booking' : `Edit Booking — ${modal?.edit?.bookingNumber || ''}`} size="lg">
        {modal && (
          <BookingForm
            item={modal?.edit || null}
            onSuccess={(result) => { setModal(null); if (!modal?.edit && result?._id) router.push(`/bookings/${result._id}`); }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      {/* ── Delete confirm ──────────────────────────────────────────── */}
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

      {/* Sprint 027 — Discharge List export modal */}
      <DischargeListExportModal
        open={dischargeOpen}
        onClose={() => setDischargeOpen(false)}
        voyages={allVoyages}
        agents={agents}
      />
    </div>
  );
}
