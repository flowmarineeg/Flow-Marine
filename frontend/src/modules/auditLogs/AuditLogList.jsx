'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { auditLogsService } from '@/services/auditLogs.service';
import PageHeader from '@/components/ui/PageHeader';
import SearchBar from '@/components/ui/SearchBar';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { MODULES } from '@/utils/constants';
import { formatDateTime } from '@/utils/formatters';
import ExportButton from '@/components/ui/ExportButton';

const ACTION_STYLES = {
  CREATE: { bg: '#D1FAE5', color: '#065F46' },
  UPDATE: { bg: '#DBEAFE', color: '#1E40AF' },
  DELETE: { bg: '#FEE2E2', color: '#991B1B' },
  LOGIN:  { bg: '#F1F5F9', color: '#475569' },
  LOGOUT: { bg: '#F1F5F9', color: '#475569' },
};

export default function AuditLogList() {
  const router = useRouter();
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [module,   setModule]   = useState('');
  const [action,   setAction]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, search, module, action, dateFrom, dateTo],
    queryFn:  () => auditLogsService.list({ page, limit: 20, search, module, action, dateFrom, dateTo }).then(r => r.data),
  });

  const logs       = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="animate-fadeIn">
      <PageHeader title="Audit Log" subtitle="Immutable record of all system actions" />

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search email or record…" />
        </div>
        <Select value={module} onChange={e => { setModule(e.target.value); setPage(1); }}
          options={MODULES.map(m => ({ value: m, label: m }))}
          placeholder="All Modules" style={{ width: 170 }} />
        <Select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}
          options={['CREATE','UPDATE','DELETE','LOGIN','LOGOUT'].map(a => ({ value: a, label: a }))}
          placeholder="All Actions" style={{ width: 140 }} />
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="input-base" style={{ width: 150 }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="input-base" style={{ width: 150 }} />
        <ExportButton module="auditLogs" filters={{ module, action, dateFrom, dateTo }} selectedIds={[]} onClear={() => {}} />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? <LoadingSpinner fullPage /> : logs.length === 0 ? <EmptyState title="No audit log entries found" /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr className="table-header">
                {['Timestamp', 'User', 'Action', 'Module', 'Record', 'IP Address'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const style = ACTION_STYLES[log.action] || ACTION_STYLES.LOGIN;
                return (
                  <tr key={log._id} className="table-row"
                    onClick={() => router.push(`/audit-logs/${log._id}`)}
                    style={{ cursor: 'pointer' }}>
                    <td><span className="mono" style={{ fontSize: 12 }}>{formatDateTime(log.timestamp)}</span></td>
                    <td><span style={{ fontSize: 13 }}>{log.userEmail}</span></td>
                    <td>
                      <span className="badge" style={{ background: style.bg, color: style.color }}>
                        {log.action}
                      </span>
                    </td>
                    <td><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{log.module}</span></td>
                    <td><span className="mono" style={{ fontSize: 12 }}>{log.recordNumber || log.recordId || '—'}</span></td>
                    <td><span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.ipAddress || '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pagination && pagination.total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{pagination.total} entries total</p>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
