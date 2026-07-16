'use client';
import PageGuard from '@/components/ui/PageGuard';
import ExpenseList from '@/modules/expenses/ExpenseList';
export default function ExpensesPage() {
  return <PageGuard module="expenses"><ExpenseList /></PageGuard>;
}
