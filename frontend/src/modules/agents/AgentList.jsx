'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { agentsService } from '@/services/agents.service';
import { usePermission } from '@/context/PermissionContext';
import { downloadFile } from '@/utils/exportHelper';
import { AGENT_STATUS } from '@/utils/constants';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import SearchBar from '@/components/ui/SearchBar';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function AgentList() {
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
    queryKey: ['agents', page, search, status],
    queryFn:  () => agentsService.list({ page, limit: 20, search, status }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => agentsService.remove(id),
    onSuccess:  () => { toast.success('Agent deleted'); qc.invalidateQueries(['agents']); setDeleteTarget(null); setSelected([]); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const agents     = data?.data || [];
  const pagination = data?.pagination;

  const toggleSelect = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll    = () => setSelected(p => p.length === agents.length ? [] : agents.map(a => a._id));

  const handleExport = async (type) => {
    setExporting(true);
    try {
      const res = await agentsService.export({ search, status }, type === 'selected' ? selected : []);
      downloadFile(res.data, `agents-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Export downloaded');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Agents"
        subtitle="Manage port agents and shipping agents"
        action={
          can('agents', 'create') && (
            <Button onClick={() => router.push('/agents/new')}>+ New Agent</Button>
          )
        }
      />

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); setSelected([]); }} placeholder="Search code, name, email…" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); setSelected([]); }}
          options={AGENT_STATUS.map(s => ({ value: s, label: s }))} placeholder="All Statuses" style={{ width: 160 }} />
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <Button variant="secondary" size="sm" onClick={() => handleExport('all')} loading={exporting}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Export
          </Button>
          {selected.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => handleExport('selected')} loading={exporting}>
              Export {selected.length} selected
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? <LoadingSpinner fullPage /> : agents.length === 0 ? <EmptyState title="No agents found" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr className="table-header">
                  <th style={{ width: 40, padding: '10px 16px' }}>
                    <input type="checkbox" checked={selected.length === agents.length && agents.length > 0}
                      onChange={toggleAll} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--teal)' }} />
                  </th>
                  {['Code', 'Name', 'Country', 'City', 'Primary Contact', 'Email', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {agents.map(a => (
                  <tr key={a._id} className="table-row">
                    <td style={{ padding: '11px 16px' }}>
                      <input type="checkbox" checked={selected.includes(a._id)} onChange={() => toggleSelect(a._id)}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--teal)' }} />
                    </td>
                    <td><span className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{a.agentCode || <span style={{ color: 'var(--text-muted)' }}>—</span>}</span></td>
                    <td><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{a.agentName}</span></td>
                    <td>{a.country || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td>{a.city    || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td>{a.contacts?.[0]?.contactPerson || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td><span className="mono" style={{ fontSize: 12 }}>{a.contacts?.[0]?.email || <span style={{ color: 'var(--text-muted)' }}>—</span>}</span></td>
                    <td><Badge label={a.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 12 }}>
                        {can('agents', 'update') && (
                          <button onClick={() => router.push(`/agents/${a._id}`)} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                        )}
                        {can('agents', 'delete') && (
                          <button onClick={() => setDeleteTarget(a)} style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {pagination.total} agent{pagination.total !== 1 ? 's' : ''} total
            {selected.length > 0 && <span style={{ color: 'var(--teal)', fontWeight: 500 }}> · {selected.length} selected</span>}
          </p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)} loading={deleteMutation.isPending}
        title="Delete Agent"
        message={`Delete "${deleteTarget?.agentName}" (${deleteTarget?.agentCode})? This action is permanent.`}
      />
    </div>
  );
}
