'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { roundsService } from '@/services/rounds.service';
import { servicesService } from '@/services/services.service';
import { usePermission } from '@/context/PermissionContext';
import { ROUND_STATUS } from '@/utils/constants';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import SearchBar from '@/components/ui/SearchBar';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import RoundForm from '@/modules/rounds/RoundForm';

import ExportButton from '@/components/ui/ExportButton';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function RoundList() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const { can } = usePermission();

  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [status,       setStatus]       = useState('');
  const [serviceId,    setServiceId]    = useState('');
  const [selected,     setSelected]     = useState([]);
  const [modal,        setModal]        = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['rounds', page, search, status, serviceId],
    queryFn:  () => roundsService.list({ page, limit: 20, search, status, serviceId }).then(r => r.data),
  });

  const { data: servicesData } = useQuery({
    queryKey: ['services-active-dropdown'],
    queryFn:  () => servicesService.listActive().then(r => r.data.data),
  });
  const services = servicesData || [];

  const deleteMutation = useMutation({
    mutationFn: (id) => roundsService.remove(id),
    onSuccess: () => {
      toast.success('Round deleted');
      qc.invalidateQueries(['rounds']);
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const rounds     = data?.data || [];
  const pagination = data?.pagination;

  const selectCls = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Rounds"
        subtitle="Create and manage operational shipping rounds"
        action={
          can('rounds', 'create') && (
            <Button onClick={() => setModal('create')}>+ New Round</Button>
          )
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="flex-1 min-w-[220px]">
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search round number, notes…" />
        </div>
        <select value={serviceId} onChange={e => { setServiceId(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">All Services</option>
          {services.map(s => <option key={s._id} value={s._id}>{s.serviceCode}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">All Statuses</option>
          {ROUND_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <ExportButton module="rounds" filters={{ status, serviceId }} selectedIds={selected} onClear={() => setSelected([])} />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : rounds.length === 0 ? (
          <EmptyState title="No rounds found" message="Create a round to start generating voyages." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="table-header">
                  {['Round No', 'Service', 'Vessel', 'Start Date', 'End Date', 'Voyages', 'Status', 'Actions'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rounds.map(round => (
                  <tr key={round._id} className="table-row">

                    {/* Round number */}
                    <td>
                      <span className="mono font-bold text-teal-600">{round.roundNumber}</span>
                    </td>

                    {/* Service */}
                    <td>
                      <div>
                        <span className="mono text-xs font-semibold text-gray-500">{round.serviceId?.serviceCode}</span>
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]">{round.serviceId?.serviceName}</p>
                      </div>
                    </td>

                    {/* Vessel */}
                    <td>
                      {round.vesselId ? (
                        <span>
                          <span className="mono text-xs font-semibold text-teal-600">{round.vesselId.vesselCode}</span>
                          <span className="text-gray-500 ml-1 text-xs">{round.vesselId.vesselName}</span>
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Dates */}
                    <td className="text-gray-600">{fmt(round.startDate)}</td>
                    <td className="text-gray-600">{fmt(round.endDate)}</td>

                    {/* Voyages */}
                    <td>
                      <button
                        onClick={() => router.push(`/rounds/${round._id}`)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full hover:bg-teal-100 transition"
                      >
                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        {round.voyageCount ?? 0} voyage{(round.voyageCount ?? 0) !== 1 ? 's' : ''}
                      </button>
                    </td>

                    {/* Status */}
                    <td><Badge label={round.status} /></td>

                    {/* Actions */}
                    <td>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => router.push(`/rounds/${round._id}`)}
                          className="text-xs font-medium text-teal-600 hover:text-teal-800 transition"
                        >
                          View
                        </button>
                        {can('rounds', 'update') && (
                          <button
                            onClick={() => setModal({ edit: round })}
                            className="text-xs font-medium text-gray-500 hover:text-gray-800 transition"
                          >
                            Edit
                          </button>
                        )}
                        {can('rounds', 'delete') && (
                          <button
                            onClick={() => setDeleteTarget(round)}
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
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">{pagination.total} round{pagination.total !== 1 ? 's' : ''} total</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'New Round' : 'Edit Round'}
        size="md"
      >
        {modal && (
          <RoundForm
            item={modal?.edit || null}
            onSuccess={(result) => {
              setModal(null);
              if (!modal?.edit && result?.round?._id) {
                router.push(`/rounds/${result.round._id}`);
              }
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
        title="Delete Round"
        message={`Delete round "${deleteTarget?.roundNumber}"? All generated voyages will be unreachable. This cannot be undone.`}
      />
    </div>
  );
}
