'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { usePermission } from '@/context/PermissionContext';
import SearchBar from '@/components/ui/SearchBar';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FormPage from '@/components/ui/FormPage';
import Pagination from '@/components/ui/Pagination';
import LocationPicker from '@/components/forms/LocationPicker';
import LocationForm from './LocationForm';

const PAGE_SIZES = [20, 50, 100].map((n) => ({ value: n, label: `${n} per page` }));

/**
 * Shared table shell for a single location level (Country/City/Port/Terminal), server-side paginated.
 * Parent filters are passed in via `filters`: [{ key, level, placeholder, parentKey? }] and rendered as searchable pickers.
 */
export default function LocationLevelTable({
  level, title, singular, listFn, removeFn, queryKey,
  columns, filters = [], filterVals, onFilterChange,
}) {
  const qc = useQueryClient();
  const { can } = usePermission();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // any change of search, filter or page size goes back to page 1
  const onSearch = (v) => { setSearch(v); setPage(1); };
  const onLimit = (n) => { setLimit(n); setPage(1); };
  const onFilter = (k, v) => { onFilterChange(k, v); setPage(1); };

  const { data, isLoading, isFetching, isPlaceholderData } = useQuery({
    queryKey: [queryKey, { search, page, limit, ...filterVals }],
    queryFn:  () => listFn({ search, page, limit, ...filterVals }).then(r => r.data),
    placeholderData: keepPreviousData, // keep the previous page on screen while the next one loads
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => removeFn(id),
    onSuccess:  () => {
      toast.success('Deleted successfully'); qc.invalidateQueries([queryKey]); setDeleteTarget(null);
      if (items.length === 1 && page > 1) setPage(page - 1); // deleted the last row of the last page
    },
    onError:    (e) => showErrorToast(e, 'delete'),
  });

  const items = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchBar value={search} onChange={onSearch} placeholder={`Search ${title.toLowerCase()}…`} debounce={300} />
        </div>

        {filters.map(f => (
          <div key={f.key} style={{ width: 220 }}>
            <LocationPicker
              level={f.level}
              value={filterVals[f.key] || ''}
              onChange={(v) => onFilter(f.key, v)}
              parent={f.parentKey ? { [f.parentKey]: filterVals[f.parentKey] } : {}}
              disabled={!!f.parentKey && !filterVals[f.parentKey]}
              placeholder={f.placeholder}
              searchPlaceholder={`Search ${f.level}…`}
            />
          </div>
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
          <div style={{ overflowX: 'auto', opacity: isFetching && isPlaceholderData ? 0.55 : 1, transition: 'opacity .15s' }}>
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

        {total > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Showing {from}–{to} of {total.toLocaleString()}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select value={limit} onChange={(e) => onLimit(Number(e.target.value))} className="input-base" style={{ width: 130, cursor: 'pointer' }} aria-label="Page size">
                {PAGE_SIZES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        )}
      </div>

      <FormPage
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
      </FormPage>

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
