'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { rolesService } from '@/services/roles.service';
import { usePermission } from '@/context/PermissionContext';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';

export default function RoleList() {
  const qc      = useQueryClient();
  const router  = useRouter();
  const { can } = usePermission();

  const [modal,        setModal]        = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn:  () => rolesService.list().then(r => r.data.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const saveMutation = useMutation({
    mutationFn: (d) => modal?.edit ? rolesService.update(modal.edit._id, d) : rolesService.create(d),
    onSuccess:  () => { toast.success(modal?.edit ? 'Role updated' : 'Role created'); qc.invalidateQueries(['roles']); setModal(null); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Operation failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => rolesService.remove(id),
    onSuccess:  () => { toast.success('Role deleted'); qc.invalidateQueries(['roles']); setDeleteTarget(null); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const openCreate = () => { reset({ name: '', description: '' }); setModal('create'); };
  const openEdit   = (r) => { reset({ name: r.name, description: r.description }); setModal({ edit: r }); };

  const roles = data || [];

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Manage roles and configure module-level access"
        action={can('roles', 'create') && <Button onClick={openCreate}>+ New Role</Button>}
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? <LoadingSpinner fullPage /> : roles.length === 0 ? <EmptyState /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr className="table-header">
                {['Role Name', 'Description', 'Type', 'Actions'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {roles.map(r => (
                <tr key={r._id} className="table-row">
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: r.isSystem ? 'var(--teal)' : 'var(--border)',
                        flexShrink: 0,
                      }} />
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{r.description || '—'}</td>
                  <td>
                    {r.isSystem ? (
                      <span style={{ fontSize: 11.5, fontWeight: 500, background: 'var(--teal-light)', color: 'var(--teal)', padding: '2px 9px', borderRadius: 99 }}>System</span>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Custom</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => router.push(`/roles/${r._id}`)}
                        style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Permissions
                      </button>
                      {can('roles', 'update') && !r.isSystem && (
                        <button onClick={() => openEdit(r)}
                          style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Edit
                        </button>
                      )}
                      {can('roles', 'delete') && !r.isSystem && (
                        <button onClick={() => setDeleteTarget(r)}
                          style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.edit ? 'Edit Role' : 'New Role'} size="sm">
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input id="name" label="Role Name" placeholder="e.g. Operations Manager" required
            error={errors.name?.message}
            {...register('name', { required: 'Role name is required' })} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Description</label>
            <textarea rows={3} placeholder="Optional description…"
              className="input-base" style={{ resize: 'vertical', fontFamily: 'inherit' }}
              {...register('description')} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{modal?.edit ? 'Save Changes' : 'Create Role'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)} loading={deleteMutation.isPending}
        title="Delete Role" message={`Delete role "${deleteTarget?.name}"? Users assigned to this role will lose their access.`} />
    </div>
  );
}
