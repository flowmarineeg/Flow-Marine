'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { servicesService } from '@/services/services.service';
import { usePermission } from '@/context/PermissionContext';
import { SERVICE_STATUS } from '@/utils/constants';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import SearchBar from '@/components/ui/SearchBar';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import ServiceForm from '@/modules/services/ServiceForm';

export default function ServiceList() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const { can } = usePermission();

  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [status,       setStatus]       = useState('');
  const [modal,        setModal]        = useState(null); // null | 'create' | { edit: service }
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['services', page, search, status],
    queryFn:  () => servicesService.list({ page, limit: 20, search, status }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => servicesService.remove(id),
    onSuccess:  () => {
      toast.success('Service deleted');
      qc.invalidateQueries(['services']);
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const services   = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Services"
        subtitle="Manage shipping services and their routes"
        action={
          can('services', 'create') && (
            <Button onClick={() => setModal('create')}>+ New Service</Button>
          )
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="flex-1 min-w-[220px]">
          <SearchBar
            value={search}
            onChange={v => { setSearch(v); setPage(1); }}
            placeholder="Search code, name…"
          />
        </div>
        <Select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
          options={SERVICE_STATUS.map(s => ({ value: s, label: s }))}
          placeholder="All Statuses"
          style={{ width: 160 }}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : services.length === 0 ? (
          <EmptyState
            title="No services found"
            message="Create your first service to define shipping lanes and routes."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="table-header">
                  {['Code', 'Name', 'Default Vessel', 'Port Calls', 'Status', 'Actions'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map(svc => (
                  <tr key={svc._id} className="table-row">

                    {/* Code */}
                    <td>
                      <span className="mono text-teal-600 font-semibold">{svc.serviceCode}</span>
                    </td>

                    {/* Name */}
                    <td>
                      <span className="font-medium text-gray-800">{svc.serviceName}</span>
                      {svc.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{svc.description}</p>
                      )}
                    </td>

                    {/* Vessel */}
                    <td>
                      {svc.defaultVesselId ? (
                        <span className="text-gray-600">
                          <span className="mono text-xs text-teal-600 font-semibold mr-1">
                            {svc.defaultVesselId.vesselCode}
                          </span>
                          {svc.defaultVesselId.vesselName}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Leg count */}
                    <td>
                      {svc.legCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                          </svg>
                          {svc.legCount} port{svc.legCount !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-500 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                          No route
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td><Badge label={svc.status} /></td>

                    {/* Actions */}
                    <td>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => router.push(`/services/${svc._id}`)}
                          className="text-xs font-medium text-teal-600 hover:text-teal-800 transition"
                        >
                          {can('services', 'update') ? 'Edit' : 'View'}
                        </button>
                        <button
                          onClick={() => router.push(`/services/${svc._id}?tab=route`)}
                          className="text-xs font-medium text-gray-500 hover:text-gray-800 transition"
                        >
                          Route
                        </button>
                        {can('services', 'delete') && (
                          <button
                            onClick={() => setDeleteTarget(svc)}
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
          <p className="text-xs text-gray-400">
            {pagination.total} service{pagination.total !== 1 ? 's' : ''} total
          </p>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'New Service' : 'Edit Service'}
        size="md"
      >
        {modal && (
          <ServiceForm
            item={modal?.edit || null}
            onSuccess={() => { setModal(null); qc.invalidateQueries(['services']); }}
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
        title="Delete Service"
        message={`Delete "${deleteTarget?.serviceName}" (${deleteTarget?.serviceCode})? This is permanent.`}
      />
    </div>
  );
}
