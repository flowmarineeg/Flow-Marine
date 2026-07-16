'use client';

import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';

const REPORT_CARDS = [
  {
    href:     '/reports/round-pnl',
    title:    'Round P&L',
    desc:     'Revenue vs expenses for a single round — breakdown by expense category.',
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
      </svg>
    ),
    color: 'text-teal-600 bg-teal-50 border-teal-200',
  },
  {
    href:     '/reports/voyage-performance',
    title:    'Voyage Performance',
    desc:     'Booking counts, freight revenue and slot utilisation per voyage.',
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
    ),
    color: 'text-purple-600 bg-purple-50 border-purple-200',
  },
  {
    href:     '/reports/bookings',
    title:    'Booking Report',
    desc:     'Filterable booking list with freight totals, by voyage, agent or date range.',
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      </svg>
    ),
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  {
    href:     '/reports/revenue',
    title:    'Revenue Report',
    desc:     'Total freight revenue grouped by service, with voyage and booking counts.',
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
    color: 'text-green-600 bg-green-50 border-green-200',
  },
  {
    href:     '/reports/expenses',
    title:    'Expense Report',
    desc:     'All operational expenses filtered by category, type, round or voyage.',
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
      </svg>
    ),
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
];

export default function ReportsHub() {
  const router = useRouter();

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="Reports"
        subtitle="Aggregated analytics across all operational data"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
        {REPORT_CARDS.map(card => (
          <button
            key={card.href}
            onClick={() => router.push(card.href)}
            className="card p-6 text-left hover:shadow-md hover:border-gray-300 transition-all group flex flex-col gap-4"
          >
            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 ${card.color}`}>
              {card.icon}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 group-hover:text-teal-600 transition-colors mb-1">
                {card.title}
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">{card.desc}</p>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-teal-600 mt-auto">
              Open report
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
