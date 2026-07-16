'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usePermission } from '../../context/PermissionContext';
import { downloadFile } from '../../utils/exportHelper';
import PageHeader from '../ui/PageHeader';
import Button from '../ui/Button';
import SearchBar from '../ui/SearchBar';
import Select from '../ui/Select';
import EmptyState from '../ui/EmptyState';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';

export default function MasterTable({
  queryKey, module, title, subtitle,
  service, columns, filters = [],
  FormComponent, exportFilename,
}) {
  const qc = useQueryClient();
  const { can } = usePermission();

  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const [filterVals,   setFilterVals]   = useState({});
  const [selected,     setSelected]     = useState([]);
  const [modal,        setModal]        = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exporting,    setExporting]    = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, page, search, filterVals],
    queryFn:  () => service.list({ page, limit: 20, search, ...filterVals }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => service.remove(id),
    onSuccess:  () => { toast.success('Deleted successfully'); qc.invalidateQueries([queryKey]); setDeleteTarget(null); setSelected([]); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const items      = data?.data || [];
  const pagination = data?.pagination;

  const toggleSelect = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll    = () => setSelected(p => p.length === items.length ? [] : items.map(i => i._id));

  const handleExport = async (type) => {
    setExporting(true);
    try {
      const selectedIds = type === 'selected' ? selected : [];
      const res = await service.export(filterVals, selectedIds);
      downloadFile(res.data, `${exportFilename}-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Export downloaded');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const singularTitle = title.replace(/s$/, '');

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            {can(module, 'create') && (
              <Button onClick={() => setModal('create')}>+ New {singularTitle}</Button>
            )}
          </div>
        }
      />

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); setSelected([]); }}
            placeholder={`Search ${title.toLowerCase()}…`}
          />
        </div>

        {filters.map(f => (
          <Select
            key={f.key}
            value={filterVals[f.key] || ''}
            onChange={(e) => { setFilterVals(p => ({ ...p, [f.key]: e.target.value })); setPage(1); setSelected([]); }}
            options={f.options}
            placeholder={`All ${f.label}`}
            style={{ width: 160 }}
          />
        ))}

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <Button variant="secondary" size="sm" onClick={() => handleExport('all')} loading={exporting}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Export
          </Button>
          {selected.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => handleExport('selected')} loading={exporting}>
              Export {selected.length} selected
            </Button>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <LoadingSpinner fullPage />
        ) : items.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} found`} message="Try adjusting your search or create a new record." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="table-header">
                  <th style={{ width: 40, padding: '10px 16px' }}>
                    <input
                      type="checkbox"
                      checked={selected.length === items.length && items.length > 0}
                      onChange={toggleAll}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--teal)' }}
                    />
                  </th>
                  {columns.map(c => <th key={c.key}>{c.label}</th>)}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className="table-row">
                    <td style={{ padding: '11px 16px' }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(item._id)}
                        onChange={() => toggleSelect(item._id)}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--teal)' }}
                      />
                    </td>
                    {columns.map(c => (
                      <td key={c.key}>
                        {c.render ? c.render(item) : (item[c.key] ?? <span style={{ color: 'var(--text-muted)' }}>—</span>)}
                      </td>
                    ))}
                    <td>
                      <div style={{ display: 'flex', gap: 12 }}>
                        {can(module, 'update') && (
                          <button onClick={() => setModal({ edit: item })} style={{
                            fontSize: 12.5, fontWeight: 500, color: 'var(--teal)',
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          }}>Edit</button>
                        )}
                        {can(module, 'delete') && (
                          <button onClick={() => setDeleteTarget(item)} style={{
                            fontSize: 12.5, fontWeight: 500, color: 'var(--red)',
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          }}>Delete</button>
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
      {pagination && pagination.total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {pagination.total} {pagination.total === 1 ? singularTitle.toLowerCase() : title.toLowerCase()} total
            {selected.length > 0 && <span style={{ color: 'var(--teal)', fontWeight: 500 }}> · {selected.length} selected</span>}
          </p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? `New ${singularTitle}` : `Edit ${singularTitle}`}
        size="sm"
      >
        {modal && (
          <FormComponent
            item={modal?.edit || null}
            onSuccess={() => { setModal(null); qc.invalidateQueries([queryKey]); }}
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
        title={`Delete ${singularTitle}`}
        message={`This action is permanent and cannot be undone.`}
      />
    </div>
  );
}
