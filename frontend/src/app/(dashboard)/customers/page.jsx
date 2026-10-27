'use client';
import PageGuard from '@/components/ui/PageGuard';
import MasterTable from '@/components/ui/MasterTable';
import CustomerForm from '@/modules/customers/CustomerForm';
import { customersService, CUSTOMER_TYPES } from '@/services/customers.service';

const TYPE_STYLES = {
  'Commercial Agent':  { bg: '#DBEAFE', color: '#1E40AF' },
  'NVOCC':             { bg: '#EDE9FE', color: '#5B21B6' },
  'Freight Forwarder': { bg: '#FEF3C7', color: '#92400E' },
};

const COLUMNS = [
  { key: 'customerCode', label: 'Code', render: (r) => <span className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{r.customerCode}</span> },
  { key: 'customerName', label: 'Name', render: (r) => <span style={{ fontWeight: 500 }}>{r.customerName}</span> },
  { key: 'customerType', label: 'Customer Type', render: (r) => {
    const s = TYPE_STYLES[r.customerType] || { bg: '#F1F5F9', color: '#475569' };
    return <span className="badge" style={{ background: s.bg, color: s.color }}>{r.customerType}</span>;
  }},
  { key: 'country', label: 'Country', render: (r) => r.country || <span style={{ color: 'var(--text-muted)' }}>-</span> },
  { key: 'contact', label: 'Contact', render: (r) => r.contacts?.[0]?.name || <span style={{ color: 'var(--text-muted)' }}>-</span> },
  { key: 'status', label: 'Status', render: (r) => <span className="badge" style={{ background: r.status === 'Active' ? '#D1FAE5' : '#F3F4F6', color: r.status === 'Active' ? '#065F46' : '#4B5563' }}>{r.status}</span> },
];
// Both filters are sent to the API and applied in the database query, so they cover the full result set.
const FILTERS = [
  { key: 'customerType', label: 'Types', options: CUSTOMER_TYPES.map(t => ({ value: t, label: t })) },
  { key: 'status', label: 'Statuses', options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }] },
];

export default function CustomersPage() {
  return (
    <PageGuard module="customers">
      <MasterTable queryKey="customers" module="customers" title="Agents/Customers"
        subtitle="End customers and shippers (commercial agents, NVOCCs, freight forwarders)" service={customersService}
        columns={COLUMNS} filters={FILTERS} FormComponent={CustomerForm} exportFilename="customers" />
    </PageGuard>
  );
}
