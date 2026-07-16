'use client';
import PageGuard from '@/components/ui/PageGuard';
import ExportPanel from '@/modules/export/ExportPanel';
export default function ExportPage() {
  return <PageGuard module="export"><ExportPanel /></PageGuard>;
}
