'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
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

  const voyages = data?.data || [];
  const pagination = data?.pagination;
  const groups = useMemo(() => groupByRound(voyages), [voyages]);

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
          {groups.map(g => (
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
                        {['Voyage No', 'Service', 'POL', 'POD', 'ETD', 'ETA', 'ATD', 'ATA', 'Status', 'Actions'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.voyages.map(v => (
                        <tr key={v._id} className="table-row">
                          <td>
                            <span className="mono text-xs font-bold text-gray-700">{v.voyageNumber}</span>
                            <p className="text-[11px] text-gray-400">{v.voyageName || '(unnamed)'}</p>
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
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">{pagination.total} voyage{pagination.total !== 1 ? 's' : ''} total</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit Voyage — ${editTarget?.voyageNumber || ''} (${editTarget?.voyageName || 'unnamed'})`}
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
        message={`Delete voyage "${deleteTarget?.voyageNumber}" (${deleteTarget?.voyageName || 'unnamed'})? This cannot be undone. Voyages with active bookings cannot be deleted.`}
      />
    </div>
  );
}
