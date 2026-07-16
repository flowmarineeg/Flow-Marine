'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usePermission } from '@/context/PermissionContext';
import SearchBar from '@/components/ui/SearchBar';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import LocationForm from './LocationForm';

/**
 * Shared table shell for a single location level (Country/City/Port/Terminal).
 * Cascading parent filters are passed in via `filters` (rendered as Select dropdowns).
 */
export default function LocationLevelTable({
  level, title, singular, listFn, removeFn, queryKey,
  columns, filters = [], filterVals, onFilterChange,
}) {
  const qc = useQueryClient();
  const { can } = usePermission();

  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, search, filterVals],
    queryFn:  () => listFn({ search, ...filterVals }).then(r => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => removeFn(id),
    onSuccess:  () => { toast.success('Deleted successfully'); qc.invalidateQueries([queryKey]); setDeleteTarget(null); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const items = data || [];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchBar value={search} onChange={setSearch} placeholder={`Search ${title.toLowerCase()}…`} />
        </div>

        {filters.map(f => (
          <Select
            key={f.key}
            value={filterVals[f.key] || ''}
            onChange={(e) => onFilterChange(f.key, e.target.value)}
            options={f.options}
            placeholder={f.placeholder}
            style={{ width: 200 }}
          />
        ))}

        {can('locations', 'create') && (
          <Button onClick={() => setModal('create')} style={{ marginLeft: 'auto' }}>+ New {singular}</Button>
        )}
      </div>

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
                  {columns.map(c => <th key={c.key}>{c.label}</th>)}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className="table-row">
                    {columns.map(c => (
                      <td key={c.key}>
                        {c.render ? c.render(item) : (item[c.key] ?? <span style={{ color: 'var(--text-muted)' }}>—</span>)}
                      </td>
                    ))}
                    <td>
                      <div style={{ display: 'flex', gap: 12 }}>
                        {can('locations', 'update') && (
                          <button onClick={() => setModal({ edit: item })} style={{
                            fontSize: 12.5, fontWeight: 500, color: 'var(--teal)',
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          }}>Edit</button>
                        )}
                        {can('locations', 'delete') && (
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

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? `New ${singular}` : `Edit ${singular}`}
        size="sm"
      >
        {modal && (
          <LocationForm
            level={level}
            item={modal?.edit || null}
            onSuccess={() => { setModal(null); qc.invalidateQueries([queryKey]); }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
        title={`Delete ${singular}`}
        message="This action is permanent and cannot be undone."
      />
    </div>
  );
}
