'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usersService } from '@/services/users.service';
import { usePermission } from '@/context/PermissionContext';
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
import UserForm from './UserForm';
import { USER_STATUS } from '@/utils/constants';

export default function UserList() {
  const qc = useQueryClient();
  const { can } = usePermission();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resendTarget, setResendTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search, status],
    queryFn: () => usersService.list({ page, limit: 20, search, status }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => usersService.remove(id),
    onSuccess: () => { toast.success('User deleted'); qc.invalidateQueries(['users']); setDeleteTarget(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const resendMutation = useMutation({
    mutationFn: (id) => usersService.resendInvite(id),
    onSuccess: () => { toast.success('Invitation resent'); setResendTarget(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to resend'),
  });

  const users = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Users"
        subtitle="Manage system users and team members"
        action={
          can('users', 'create') && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={() => setModal('invite')}>Send Invitation</Button>
              <Button onClick={() => setModal('create')}>+ Create User</Button>
            </div>
          )
        }
      />

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search by name or email…" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          options={USER_STATUS.map(s => ({ value: s, label: s }))}
          placeholder="All Statuses" style={{ width: 160 }} />
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? <LoadingSpinner fullPage /> : users.length === 0 ? <EmptyState title="No users found" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr className="table-header">
                {['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} className="table-row">
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      
                      <div>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{u.name}</span>
                        {u.isInvited && !u.password && (
                          <span style={{ marginLeft: 8, fontSize: 11, background: '#FEF3C7', color: '#92400E', padding: '1px 7px', borderRadius: 99, fontWeight: 500 }}>
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td><span className="mono" style={{ fontSize: 12.5 }}>{u.email}</span></td>
                  <td>{u.roleId?.name || '—'}</td>
                  <td><Badge label={u.status} /></td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {can('users', 'update') && (
                        <button onClick={() => setModal({ edit: u })} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                      )}
                      {can('users', 'update') && u.isInvited && !u.password && (
                        <button onClick={() => setResendTarget(u)} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--amber)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Resend</button>
                      )}
                      {can('users', 'delete') && (
                        <button onClick={() => setDeleteTarget(u)} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagination && pagination.total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{pagination.total} users total</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Modals */}
      <Modal open={modal === 'create' || !!modal?.edit} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Create User' : 'Edit User'} size="md">
        {(modal === 'create' || modal?.edit) && (
          <UserForm user={modal?.edit || null} mode={modal === 'create' ? 'create' : 'edit'}
            onSuccess={() => { setModal(null); qc.invalidateQueries(['users']); }}
            onCancel={() => setModal(null)} />
        )}
      </Modal>

      <Modal open={modal === 'invite'} onClose={() => setModal(null)} title="Send Invitation" size="md">
        <UserForm mode="invite"
          onSuccess={() => { setModal(null); qc.invalidateQueries(['users']); }}
          onCancel={() => setModal(null)} />
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)} loading={deleteMutation.isPending}
        title="Delete User" message={`Delete "${deleteTarget?.name}"? This cannot be undone.`} />

      <ConfirmDialog open={!!resendTarget} onClose={() => setResendTarget(null)}
        onConfirm={() => resendMutation.mutate(resendTarget._id)} loading={resendMutation.isPending}
        title="Resend Invitation" message={`Resend invitation email to "${resendTarget?.email}"?`}
        confirmLabel="Resend" />
    </div>
  );
}
