'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { vesselsService } from '@/services/vessels.service';
import { usePermission } from '@/context/PermissionContext';
import { downloadFile } from '@/utils/exportHelper';
import { VESSEL_STATUS } from '@/utils/constants';
import PageHeader    from '@/components/ui/PageHeader';
import Button        from '@/components/ui/Button';
import Badge         from '@/components/ui/Badge';
import SearchBar     from '@/components/ui/SearchBar';
import Select        from '@/components/ui/Select';
import Pagination    from '@/components/ui/Pagination';
import EmptyState    from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function VesselList() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const { can } = usePermission();

  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [status,       setStatus]       = useState('');
  const [selected,     setSelected]     = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exporting,    setExporting]    = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['vessels', page, search, status],
    queryFn:  () => vesselsService.list({ page, limit: 20, search, status }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => vesselsService.remove(id),
    onSuccess:  () => { toast.success('Vessel deleted'); qc.invalidateQueries(['vessels']); setDeleteTarget(null); setSelected([]); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const vessels    = data?.data || [];
  const pagination = data?.pagination;

  const toggleSelect = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll    = () => setSelected(p => p.length === vessels.length ? [] : vessels.map(v => v._id));

  const handleExport = async (type) => {
    setExporting(true);
    try {
      const res = await vesselsService.export({ search, status }, type === 'selected' ? selected : []);
      downloadFile(res.data, `vessels-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Export downloaded');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const sc = 'text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer';

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Vessels"
        subtitle="Manage your fleet master data"
        action={can('vessels', 'create') && (
          <Button onClick={() => router.push('/vessels/new')}>+ New Vessel</Button>
        )}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="flex-1 min-w-[220px]">
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); setSelected([]); }} placeholder="Search code, name, IMO…" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); setSelected([]); }}
          options={VESSEL_STATUS.map(s => ({ value: s, label: s }))} placeholder="All Statuses" style={{ width: 160 }} />
        <div className="flex gap-2 ml-auto">
          {(can('export', 'read') && can('vessels', 'export')) && (
            <>
              <button onClick={() => handleExport('all')} disabled={exporting}
                className="btn btn-secondary btn-sm flex items-center gap-1.5">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Export
              </button>
              {selected.length > 0 && (
                <button onClick={() => handleExport('selected')} disabled={exporting}
                  className="btn btn-secondary btn-sm">
                  Export {selected.length} selected
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? <LoadingSpinner fullPage /> : vessels.length === 0 ? <EmptyState title="No vessels found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="table-header">
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" checked={selected.length === vessels.length && vessels.length > 0}
                      onChange={toggleAll} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
                  </th>
                  {['Code', 'Name', 'IMO', 'Flag', 'Ownership', 'Capacity', 'Status', 'Actions'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vessels.map(v => (
                  <tr key={v._id} className="table-row">
                    <td className="px-4">
                      <input type="checkbox" checked={selected.includes(v._id)} onChange={() => toggleSelect(v._id)}
                        className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
                    </td>
                    <td><span className="mono text-xs font-bold text-teal-600">{v.vesselCode}</span></td>
                    <td><span className="text-sm font-medium text-gray-800">{v.vesselName}</span></td>
                    <td><span className="mono text-xs">{v.imoNumber || <span className="text-gray-300">—</span>}</span></td>
                    <td className="text-sm text-gray-600">{v.flag || <span className="text-gray-300">—</span>}</td>
                    <td>
                      <span className="text-xs text-gray-600">{v.ownershipType}</span>
                      {v.ownershipDescription && (
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[140px]" title={v.ownershipDescription}>
                          {v.ownershipDescription}
                        </p>
                      )}
                    </td>
                    <td>
                      <span className="mono text-xs text-gray-600">
                        {v.capacity != null ? v.capacity.toLocaleString() : <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                    <td><Badge label={v.status} /></td>
                    <td>
                      <div className="flex items-center gap-3">
                        <button onClick={() => router.push(`/vessels/${v._id}`)}
                          className="text-xs font-medium text-teal-600 hover:text-teal-800 transition">View</button>
                        {can('vessels', 'update') && (
                          <button onClick={() => router.push(`/vessels/${v._id}/edit`)}
                            className="text-xs font-medium text-gray-500 hover:text-gray-700 transition">Edit</button>
                        )}
                        {can('vessels', 'delete') && (
                          <button onClick={() => setDeleteTarget(v)}
                            className="text-xs font-medium text-red-400 hover:text-red-600 transition">Delete</button>
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

      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            {pagination.total} vessel{pagination.total !== 1 ? 's' : ''} total
            {selected.length > 0 && <span className="text-teal-600 font-medium"> · {selected.length} selected</span>}
          </p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)} loading={deleteMutation.isPending}
        title="Delete Vessel"
        message={`Delete "${deleteTarget?.vesselName}" (${deleteTarget?.vesselCode})? This cannot be undone.`}
      />
    </div>
  );
}
