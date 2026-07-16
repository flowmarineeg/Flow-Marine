'use client';
import PageGuard from '@/components/ui/PageGuard';
import MasterTable from '@/components/ui/MasterTable';
import ContainerTypeForm from '@/modules/containerTypes/ContainerTypeForm';
import { containerTypesService } from '@/services/containerTypes.service';
import { CONTAINER_SIZES, CONTAINER_TYPES_LIST } from '@/utils/constants';

const COLUMNS = [
  { key: 'code', label: 'Code', render: (r) => <span className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{r.code}</span> },
  { key: 'description', label: 'Description', render: (r) => r.description || <span style={{ color: 'var(--text-muted)' }}>—</span> },
  { key: 'size', label: 'Size', render: (r) => <span className="badge" style={{ background: '#DBEAFE', color: '#1E40AF' }}>{r.size}</span> },
  { key: 'type', label: 'Type', render: (r) => <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6' }}>{r.type}</span> },
];
const FILTERS = [
  { key: 'size', label: 'Sizes', options: CONTAINER_SIZES.map(s => ({ value: s, label: s })) },
  { key: 'type', label: 'Types', options: CONTAINER_TYPES_LIST.map(t => ({ value: t, label: t })) },
];

export default function ContainerTypesPage() {
  return (
    <PageGuard module="containerTypes">
      <MasterTable queryKey="containerTypes" module="containerTypes" title="Container Types"
        subtitle="Manage container size and type definitions" service={containerTypesService}
        columns={COLUMNS} filters={FILTERS} FormComponent={ContainerTypeForm} exportFilename="container-types" />
    </PageGuard>
  );
}
