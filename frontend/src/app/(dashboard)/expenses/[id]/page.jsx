'use client';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import PageGuard from '@/components/ui/PageGuard';
import { expensesService } from '@/services/expenses.service';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PageHeader from '@/components/ui/PageHeader';
import ExpenseForm from '@/modules/expenses/ExpenseForm';

function EditExpenseContent({ id }) {
  const router = useRouter();
  const { data: expense, isLoading, isError } = useQuery({
    queryKey: ['expense', id],
    queryFn: () => expensesService.getById(id).then(r => r.data.data),
  });

  if (isLoading) return <LoadingSpinner fullPage />;
  if (isError || !expense) return (
    <div className="flex flex-col items-center py-24 text-gray-400">
      <p className="text-sm">Expense not found</p>
      <button onClick={() => router.push('/expenses')} className="mt-3 text-sm text-teal-600 hover:underline">← Back</button>
    </div>
  );

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => router.push('/expenses')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Expenses
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-700">Edit</span>
      </div>
      <PageHeader title="Edit Expense" subtitle={`${expense.expenseTypeId?.name || ''} — ${expense.currency} ${expense.amount}`} />
      <ExpenseForm item={expense} />
    </div>
  );
}

export default function EditExpensePage({ params }) {
  const { id } = use(params);
  return <PageGuard module="expenses"><EditExpenseContent id={id} /></PageGuard>;
}
