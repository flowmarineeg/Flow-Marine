'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { rolesService, permissionsService } from '@/services/roles.service';
import { MODULES } from '@/utils/constants';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PageHeader from '@/components/ui/PageHeader';

const ACTIONS = ['view', 'read', 'create', 'update', 'delete', 'hidden'];

const ACTION_COLORS = {
  view:   { active: '#DBEAFE', text: '#1E40AF' },
  read:   { active: '#D1FAE5', text: '#065F46' },
  create: { active: '#CCFBF1', text: '#0F766E' },
  update: { active: '#FEF3C7', text: '#92400E' },
  delete: { active: '#FEE2E2', text: '#991B1B' },
  hidden: { active: '#F3E8FF', text: '#6B21A8' },
};

const MODULE_LABELS = {
  users: 'Users', roles: 'Roles', vessels: 'Vessels', agents: 'Agents',
  locations: 'Locations', containerTypes: 'Container Types', expenseTypes: 'Expense Types',
  services: 'Services', routes: 'Routes', rounds: 'Rounds', voyages: 'Voyages',
  bookings: 'Bookings', expenses: 'Expenses', invoices: 'Invoices',
  tracking: 'Tracking', reports: 'Reports', export: 'Export', auditLogs: 'Audit Logs',
};

const MODULE_GROUPS = {
  'Core':       ['users', 'roles', 'auditLogs'],
  'Operations': ['rounds', 'voyages', 'bookings', 'expenses', 'invoices', 'tracking'],
  'Masters':    ['vessels', 'agents', 'locations', 'containerTypes', 'expenseTypes', 'services', 'routes'],
  'Analytics':  ['reports', 'export'],
};

export default function PermissionMatrix({ roleId }) {
  const router   = useRouter();
  const [perms,  setPerms]   = useState({});
  const [saving, setSaving]  = useState(false);

  const { data: roleData } = useQuery({
    queryKey: ['role', roleId],
    queryFn:  () => rolesService.getById(roleId).then(r => r.data.data),
  });

  const { data: permData, isLoading } = useQuery({
    queryKey: ['permissions', roleId],
    queryFn:  () => permissionsService.getByRoleId(roleId).then(r => r.data.data),
  });

  useEffect(() => {
    if (permData) {
      const map = {};
      permData.forEach(p => { map[p.module] = { ...p.actions }; });
      setPerms(map);
    }
  }, [permData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = Object.entries(perms).map(([module, actions]) => ({ module, actions }));
      await permissionsService.saveByRoleId(roleId, payload);
      toast.success('Permissions saved');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (module, action) => {
    setPerms(prev => ({ ...prev, [module]: { ...prev[module], [action]: !prev[module]?.[action] } }));
  };

  const setAll = (module, value) => {
    setPerms(prev => ({ ...prev, [module]: { view: value, read: value, create: value, update: value, delete: value, hidden: false } }));
  };

  const isSystem = roleData?.isSystem;
  if (isLoading) return <LoadingSpinner fullPage />;

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title={`Permissions — ${roleData?.name || '…'}`}
        subtitle="Configure module-level access for this role"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => router.back()}>← Back</Button>
            {!isSystem && <Button onClick={handleSave} loading={saving}>Save Permissions</Button>}
          </div>
        }
      />

      {isSystem && (
        <div style={{ background: 'var(--teal-light)', border: '1px solid var(--teal)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--teal-dark)' }}>
          SuperAdmin has full access to all modules. Permissions are read-only for system roles.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Object.entries(MODULE_GROUPS).map(([groupName, modules]) => (
          <div key={groupName} className="card" style={{ overflow: 'hidden' }}>
            {/* Group header */}
            <div style={{ padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                {groupName}
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="table-header">
                  <th style={{ minWidth: 150 }}>Module</th>
                  {ACTIONS.map(a => (
                    <th key={a} style={{ textAlign: 'center', textTransform: 'capitalize' }}>{a}</th>
                  ))}
                  {!isSystem && <th style={{ textAlign: 'center' }}>Quick Set</th>}
                </tr>
              </thead>
              <tbody>
                {modules.map(mod => (
                  <tr key={mod} className="table-row">
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{MODULE_LABELS[mod]}</td>
                    {ACTIONS.map(action => {
                      const isOn = isSystem || perms[mod]?.[action] === true;
                      const colors = ACTION_COLORS[action];
                      return (
                        <td key={action} style={{ textAlign: 'center' }}>
                          {isSystem ? (
                            <span style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: 5, background: colors.active, alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="11" height="11" fill="none" stroke={colors.text} strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            </span>
                          ) : (
                            <button
                              onClick={() => toggle(mod, action)}
                              style={{
                                width: 20, height: 20, borderRadius: 5, cursor: 'pointer', border: 'none',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: isOn ? colors.active : '#F1F5F9',
                                transition: 'all 0.15s',
                              }}
                            >
                              {isOn && <svg width="11" height="11" fill="none" stroke={colors.text} strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    {!isSystem && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <button onClick={() => setAll(mod, true)} style={{ fontSize: 11.5, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>All</button>
                          <span style={{ color: 'var(--border)' }}>|</span>
                          <button onClick={() => setAll(mod, false)} style={{ fontSize: 11.5, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>None</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
