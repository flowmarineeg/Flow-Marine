'use client';
import PageGuard from '@/components/ui/PageGuard';
import MasterTable from '@/components/ui/MasterTable';
import PartnerForm from '@/modules/partners/PartnerForm';
import { partnersService } from '@/services/partners.service';

const COLUMNS = [
  { key: 'code', label: 'Code', render: (r) => <span className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{r.code}</span> },
  { key: 'name', label: 'Name' },
  { key: 'contact', label: 'Contact', render: (r) => r.contact?.person || r.contact?.email || <span style={{ color: 'var(--text-muted)' }}>-</span> },
  { key: 'status', label: 'Status', render: (r) => <span className="badge" style={{ background: r.status === 'Active' ? '#D1FAE5' : '#F3F4F6', color: r.status === 'Active' ? '#065F46' : '#4B5563' }}>{r.status}</span> },
];
const FILTERS = [
  { key: 'status', label: 'Statuses', options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }] },
];

// MasterTable expects service.export; partners have no Excel export in Sprint 050.
const service = { ...partnersService, export: () => Promise.reject(new Error('not supported')) };

export default function PartnersPage() {
  return (
    <PageGuard module="partners">
      <MasterTable queryKey="partners" module="partners" title="Partners"
        subtitle="Joint-venture partner companies" service={service}
        columns={COLUMNS} filters={FILTERS} FormComponent={PartnerForm} exportFilename="partners" />
    </PageGuard>
  );
}
