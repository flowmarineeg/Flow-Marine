'use client';

import { useRouter } from 'next/navigation';
import { usePermission } from '@/context/PermissionContext';
import { WidgetCard } from './widgets/WidgetPrimitives';

// Sprint 039 Refinement 3 — Quick Actions. Every action navigates to an
// already-existing create route/form; no new modal or creation flow is
// introduced. Gated by the same can(module, 'create') check every
// existing "+ New X" button already uses.
const ACTIONS = [
  { module: 'bookings', label: '+ New Booking',        href: '/bookings/new' },
  { module: 'bookings', label: '+ New Manual Booking',  href: '/bookings/new-manual' },
  { module: 'bookings', label: '⭱ Import Bookings',     href: '/bookings/import' },
  { module: 'expenses', label: '+ New Expense',          href: '/expenses/new' },
  { module: 'invoices', label: '+ New Invoice',          href: '/invoices/new' },
  { module: 'rounds',   label: '+ New Round',            href: '/rounds' },
];

export default function QuickActionsWidget() {
  const router = useRouter();
  const { can } = usePermission();
  const actions = ACTIONS.filter(a => can(a.module, 'create'));

  if (actions.length === 0) return null;

  return (
    <WidgetCard title="Quick Actions">
      <div className="flex flex-wrap gap-2">
        {actions.map(a => (
          <button
            key={a.href}
            onClick={() => router.push(a.href)}
            className="btn btn-secondary btn-sm"
          >
            {a.label}
          </button>
        ))}
      </div>
    </WidgetCard>
  );
}
