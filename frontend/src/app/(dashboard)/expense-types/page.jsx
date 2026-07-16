'use client';
import PageGuard from '@/components/ui/PageGuard';
import MasterTable from '@/components/ui/MasterTable';
import ExpenseTypeForm from '@/modules/expenseTypes/ExpenseTypeForm';
import { expenseTypesService } from '@/services/expenseTypes.service';
import { EXPENSE_CATEGORIES } from '@/utils/constants';

const CATEGORY_STYLES = {
  'Port Expense':      { bg: '#DBEAFE', color: '#1E40AF' },
  'Operating Expense': { bg: '#FEF3C7', color: '#92400E' },
  'Other':             { bg: '#F1F5F9', color: '#475569' },
};
const COLUMNS = [
  { key: 'name', label: 'Name', render: (r) => <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.name}</span> },
  { key: 'category', label: 'Category', render: (r) => {
    const s = CATEGORY_STYLES[r.category] || { bg: '#F1F5F9', color: '#475569' };
    return <span className="badge" style={{ background: s.bg, color: s.color }}>{r.category}</span>;
  }},
];
const FILTERS = [
  { key: 'category', label: 'Categories', options: EXPENSE_CATEGORIES.map(c => ({ value: c, label: c })) },
];

export default function ExpenseTypesPage() {
  return (
    <PageGuard module="expenseTypes">
      <MasterTable queryKey="expenseTypes" module="expenseTypes" title="Expense Types"
        subtitle="Manage expense categories and types" service={expenseTypesService}
        columns={COLUMNS} filters={FILTERS} FormComponent={ExpenseTypeForm} exportFilename="expense-types" />
    </PageGuard>
  );
}
