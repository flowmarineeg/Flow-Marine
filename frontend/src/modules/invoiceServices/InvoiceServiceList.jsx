'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { invoiceServicesService } from '@/services/invoiceServices.service';
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
import InvoiceServiceForm from '@/modules/invoiceServices/InvoiceServiceForm';

const APPLIES = { SOC_ONLY: 'SOC only', COC_ONLY: 'COC only', BOTH: 'SOC & COC' };

export default function InvoiceServiceList() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null); // null | 'create' | { edit }
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-services', page, search, status],
    queryFn: () => invoiceServicesService.list({ page, limit: 20, search, status }).then(r => r.data),
  });

  const del = useMutation({
    mutationFn: (id) => invoiceServicesService.remove(id),
    onSuccess: () => { toast.success('Invoice service deleted'); qc.invalidateQueries({ queryKey: ['invoice-services'] }); setDeleteTarget(null); },
    onError: (e) => showErrorToast(e, 'delete'),
  });

  const rows = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Invoice Services"
        subtitle="Services printed on invoices, with their tax and revenue account"
        action={can('invoiceServices', 'create') && <Button onClick={() => setModal('create')}>+ New Invoice Service</Button>}
      />
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="flex-1 min-w-[220px]">
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search service name…" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          options={SERVICE_STATUS.map(s => ({ value: s, label: s }))} placeholder="All Statuses" style={{ width: 160 }} />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner fullPage /> : rows.length === 0 ? (
          <EmptyState title="No invoice services" message="Add the services you bill, e.g. SOC Slot Booking, THC, Reefer Monitoring." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="table-header">{['Service Name', 'Applicability', 'Taxable', 'Revenue Account', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s._id} className="table-row">
                    <td><span className="font-medium text-gray-800">{s.serviceName}</span></td>
                    <td className="text-xs text-gray-600">{APPLIES[s.applicability] || s.applicability}</td>
                    <td className="text-xs text-gray-600">{s.isTaxable ? 'Yes' : 'No'}</td>
                    <td className="text-xs text-gray-600"><span className="mono">{s.revenueAccountId?.code}</span> {s.revenueAccountId?.name}</td>
                    <td><Badge label={s.status} /></td>
                    <td>
                      <div className="flex items-center gap-3">
                        {can('invoiceServices', 'update') && <button onClick={() => setModal({ edit: s })} className="text-xs font-medium text-teal-600 hover:text-teal-800">Edit</button>}
                        {can('invoiceServices', 'delete') && <button onClick={() => setDeleteTarget(s)} className="text-xs font-medium text-red-400 hover:text-red-600">Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">{pagination.total} invoice service{pagination.total !== 1 ? 's' : ''} total</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'New Invoice Service' : 'Edit Invoice Service'} size="md">
        {modal && <InvoiceServiceForm item={modal?.edit || null} onSuccess={() => setModal(null)} onCancel={() => setModal(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => del.mutate(deleteTarget._id)}
        loading={del.isPending} title="Delete Invoice Service" message={`Delete "${deleteTarget?.serviceName}"? This is permanent.`} />
    </div>
  );
}
