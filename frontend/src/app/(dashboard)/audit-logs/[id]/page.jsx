'use client';
import { use } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import AuditLogDetail from '@/modules/auditLogs/AuditLogDetail';
export default function AuditLogDetailPage({ params }) {
  const { id } = use(params);
  return <PageGuard module="auditLogs"><AuditLogDetail logId={id} /></PageGuard>;
}
