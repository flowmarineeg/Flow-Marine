'use client';

// Sprint020 PERF-006: register only what's used instead of ...registerables
// Saves ~120KB from the dashboard bundle
import {
  Chart,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement,
  LineController, BarController, DoughnutController,
  Tooltip, Legend, Filler,
} from 'chart.js';

Chart.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, ArcElement,
  LineController, BarController, DoughnutController,
  Tooltip, Legend, Filler,
);

import { useAuth } from '@/context/AuthContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { MdAnchor } from 'react-icons/md';

import { DashboardFilterProvider } from '@/modules/dashboard/DashboardFilterContext';
import DashboardFilterBar  from '@/modules/dashboard/DashboardFilterBar';
import QuickActionsWidget  from '@/modules/dashboard/QuickActionsWidget';
import OperationsSection   from '@/modules/dashboard/sections/OperationsSection';
import CommercialSection   from '@/modules/dashboard/sections/CommercialSection';
import FinancialSection    from '@/modules/dashboard/sections/FinancialSection';
import BookingsSection     from '@/modules/dashboard/sections/BookingsSection';
import PerformanceSection  from '@/modules/dashboard/sections/PerformanceSection';
import AlertsSection       from '@/modules/dashboard/sections/AlertsSection';

// ── Main Dashboard ────────────────────────────────────────────────────────────
// Sprint 039 — restructured from one monolithic page into
// Dashboard → Sections → independent Widgets (Section 3.4 of
// sprints/039-sprint.txt). Each Section below arranges its own Widgets;
// no Section or Widget waits on another's data (Refinement 4) — every
// Widget owns its own useQuery.
export default function DashboardPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.roleId?.isSystem === true;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <DashboardFilterProvider>
      <div className="animate-fadeIn flex flex-col gap-5">

        {/* Welcome */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">
              {greeting()}, {user?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-full">
            <MdAnchor className="w-3.5 h-3.5" />
            {user?.roleId?.name || 'Operations'}
          </span>
        </div>

        {/* Sprint 039 Refinement 1 — Global Dashboard Filter Bar */}
        <DashboardFilterBar />

        {/* Sprint 039 Refinement 3 — Quick Actions */}
        <QuickActionsWidget />

        <OperationsSection />
        <CommercialSection />
        <FinancialSection />
        <BookingsSection />
        <PerformanceSection />
        <AlertsSection />
      </div>
    </DashboardFilterProvider>
  );
}
