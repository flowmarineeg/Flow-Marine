'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { sortVoyagesForDisplay } from '@/utils/voyageDisplayOrder';
import { getVoyageLabel } from '@/utils/voyageLabel';
import { voyagesService } from '@/services/voyages.service';
import { servicesService } from '@/services/services.service';
import { usePermission } from '@/context/PermissionContext';
import { VOYAGE_STATUS } from '@/utils/constants';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ExportButton from '@/components/ui/ExportButton';
import Button from '@/components/ui/Button';
import VoyageEditForm from '@/modules/voyages/VoyageEditForm';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Sprint 042 — voyages arrive from the backend already sorted by
// { roundId: 1, sequence: 1 } (voyage.service.js#list), so a simple
// single-pass reduce groups them into contiguous, ordered Round sections
// without needing to re-sort client-side. A Round only ever appears here
// if at least one of its voyages matched the current filters/page — a
// Round with zero matches never gets a group, which is exactly the
// "hide empty rounds entirely" behavior this design calls for.
const groupByRound = (voyages) => {
  const groups = [];
  let current = null;
  voyages.forEach(v => {
    const roundId = String(v.roundId?._id || v.roundId || 'unknown');
    if (!current || current.roundId !== roundId) {
      current = { roundId, round: v.roundId, voyages: [] };
      groups.push(current);
    }
    current.voyages.push(v);
  });
  return groups;
};

export default function VoyageList() {
  const qc = useQueryClient();
  const { can } = usePermission();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selected, setSelected] = useState([]); // Sprint 047 — flat, page-wide
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['voyages', page, status, serviceId],
    queryFn: () => voyagesService.list({ page, limit: 20, status, serviceId }).then(r => r.data),
  });

  const { data: servicesData } = useQuery({
    queryKey: ['services-active-dropdown'],
    queryFn: () => servicesService.listActive().then(r => r.data.data),
  });
  const services = servicesData || [];

  const deleteMutation = useMutation({
    mutationFn: (id) => voyagesService.remove(id),
    onSuccess: () => {
      toast.success('Voyage deleted');
      setDeleteTarget(null);
      qc.invalidateQueries(['voyages']);
    },
    onError: (e) => {
      showErrorToast(e, 'delete');
      setDeleteTarget(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => {
      const failed = [];
      let deletedCount = 0;
      for (const id of ids) {
        try {
          await voyagesService.remove(id);
          deletedCount++;
        } catch (e) {
          failed.push({ id, reason: e?.response?.data?.message || e?.message || 'Delete failed' });
        }
      }
      return { deletedCount, failed };
    },
    onSuccess: ({ deletedCount, failed }) => {
      qc.invalidateQueries(['voyages']);
      setSelected([]);
      setBulkConfirm(false);
      if (failed.length === 0) {
        toast.success(`${deletedCount} voyage${deletedCount !== 1 ? 's' : ''} deleted`);
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
    },
  });

  const voyages = data?.data || [];
  const pagination = data?.pagination;
  const groups = useMemo(() => groupByRound(voyages), [voyages]);
  const toggleSelect = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleSelectAll = () => setSelected(p => p.length === voyages.length ? [] : voyages.map(v => v._id));

  // Sprint 043 — display order by physical vessel flow, not raw `sequence`.
  // Fetch each visible Round's own route legs (same endpoint VoyageAddForm
  // already uses) so sortVoyagesForDisplay can resolve each voyage's real
  // leg position — display-only, does not touch sequence/capacity/DB data.
  const roundIds = useMemo(
    () => groups.map(g => g.roundId).filter(id => id && id !== 'unknown'),
    [groups]
  );
  const legsQueries = useQueries({
    queries: roundIds.map(roundId => ({
      queryKey: ['round-route-ports', roundId],
      queryFn:  () => voyagesService.getRoundRoutePorts(roundId).then(r => r.data.data),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const legsByRound = useMemo(() => {
    const map = {};
    roundIds.forEach((roundId, i) => { map[roundId] = legsQueries[i]?.data || []; });
    return map;
  }, [roundIds, legsQueries]);

  const selectCls = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Voyages"
        subtitle="System-generated voyages from round route legs, grouped by Round"
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select value={serviceId} onChange={e => { setServiceId(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">All Services</option>
          {services.map(s => <option key={s._id} value={s._id}>{s.serviceCode}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">All Statuses</option>
          {VOYAGE_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <ExportButton module="voyages" filters={{ serviceId, status }} selectedIds={[]} onClear={() => { }} />
        {/* Sprint 047 — bulk select + delete */}
        {voyages.length > 0 && (
          <Button variant="secondary" size="sm" onClick={toggleSelectAll}>
            {selected.length === voyages.length ? 'Clear Selection' : 'Select All'}
          </Button>
        )}
        {selected.length > 0 && can('voyages', 'delete') && (
          <Button variant="danger" size="sm" onClick={() => setBulkConfirm(true)}>
            Delete Selected ({selected.length})
          </Button>
        )}
      </div>

      {/* Grouped-by-Round sections */}
      {isLoading ? (
        <div className="card overflow-hidden"><LoadingSpinner fullPage /></div>
      ) : groups.length === 0 ? (
        <div className="card overflow-hidden">
          <EmptyState title="No voyages found" message="Voyages are auto-generated when a round is created." />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(g => {
            const displayVoyages = sortVoyagesForDisplay(g.voyages, legsByRound[g.roundId] || []);
            return (
            <div key={g.roundId} className="flex flex-col gap-2">
              {/* Round label */}
              <div className="flex items-center gap-2 px-1">
                <span className="mono text-sm font-bold text-teal-700">{g.round?.roundNumber || '—'}</span>
                <span className="text-xs text-gray-400">{g.round?.roundName || '(unnamed)'}</span>
                <span className="text-[11px] text-gray-300">· {g.voyages.length} voyage{g.voyages.length !== 1 ? 's' : ''}</span>
              </div>

              {/* This round's voyages table */}
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="table-header">
                        <th className="w-10 px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={g.voyages.every(v => selected.includes(v._id))}
                            onChange={() => {
                              const groupIds = g.voyages.map(v => v._id);
                              const allSelected = groupIds.every(id => selected.includes(id));
                              setSelected(p => allSelected ? p.filter(id => !groupIds.includes(id)) : [...new Set([...p, ...groupIds])]);
                            }}
                            className="w-3.5 h-3.5 cursor-pointer accent-teal-600"
                          />
                        </th>
                        {['Voyage No', 'Service', 'POL', 'POD', 'ETD', 'ETA', 'ATD', 'ATA', 'Status', 'Actions'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayVoyages.map(v => (
                        <tr key={v._id} className="table-row">
                          <td className="px-4">
                            <input type="checkbox" checked={selected.includes(v._id)} onChange={() => toggleSelect(v._id)} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
                          </td>
                          <td>
                            <span className="mono text-xs font-bold text-gray-700">{getVoyageLabel(v)}</span>
                          </td>
                          <td><span className="mono text-xs font-semibold text-teal-600">{v.serviceId?.serviceCode}</span></td>
                          <td>
                            <span className="text-sm text-gray-700">{v.polId?.name}</span>
                            {v.polId?.code && <span className="ml-1 mono text-[10px] text-gray-400">{v.polId.code}</span>}
                          </td>
                          <td>
                            <span className="text-sm text-gray-700">{v.podId?.name}</span>
                            {v.podId?.code && <span className="ml-1 mono text-[10px] text-gray-400">{v.podId.code}</span>}
                          </td>
                          <td className={`text-xs ${v.etd ? 'text-gray-600' : 'text-gray-300'}`}>{fmt(v.etd)}</td>
                          <td className={`text-xs ${v.atd ? 'text-blue-600 font-medium' : 'text-gray-300'}`}>{fmt(v.atd)}</td>
                          <td className={`text-xs ${v.eta ? 'text-gray-600' : 'text-gray-300'}`}>{fmt(v.eta)}</td>
                          <td className={`text-xs ${v.ata ? 'text-blue-600 font-medium' : 'text-gray-300'}`}>{fmt(v.ata)}</td>
                          <td><Badge label={v.status} /></td>
                          <td>
                            <div className="flex items-center gap-3">
                              {can('voyages', 'update') && (
                                <button
                                  onClick={() => setEditTarget(v)}
                                  className="text-xs font-medium text-teal-600 hover:text-teal-800 transition"
                                >
                                  Edit
                                </button>
                              )}
                              {can('voyages', 'delete') && (
                                <button
                                  onClick={() => setDeleteTarget(v)}
                                  className="text-xs font-medium text-red-400 hover:text-red-600 transition"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            {pagination.total} voyage{pagination.total !== 1 ? 's' : ''} total
            {selected.length > 0 && <span className="text-teal-600 font-medium"> · {selected.length} selected</span>}
          </p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit Voyage — ${getVoyageLabel(editTarget) || ''}`}
        size="md"
      >
        {editTarget && (
          <VoyageEditForm
            voyage={editTarget}
            onSuccess={() => {
              setEditTarget(null);
              qc.invalidateQueries(['voyages']);
            }}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
        title="Delete Voyage"
        message={`Delete voyage "${getVoyageLabel(deleteTarget)}"? This cannot be undone. Voyages with active bookings cannot be deleted.`}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={bulkConfirm}
        onClose={() => setBulkConfirm(false)}
        onConfirm={() => bulkDeleteMutation.mutate(selected)}
        loading={bulkDeleteMutation.isPending}
        title="Delete Selected Voyages"
        message={`Delete ${selected.length} selected voyage${selected.length !== 1 ? 's' : ''}? This cannot be undone. Any voyage that can't be deleted (e.g. it has active bookings) will be reported and skipped.`}
        confirmLabel="Delete Selected"
      />
    </div>
  );
}
