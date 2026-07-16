'use client';
import PageGuard from '@/components/ui/PageGuard';
import AuditLogList from '@/modules/auditLogs/AuditLogList';
export default function AuditLogsPage() {
  return <PageGuard module="auditLogs"><AuditLogList /></PageGuard>;
}
