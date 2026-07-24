'use client';

import { TotalRevenueWidget, RevenueTrendWidget, RevenueByServiceWidget } from '../widgets/CommercialWidgets';

export default function CommercialSection() {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Commercial</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TotalRevenueWidget />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueTrendWidget />
        <RevenueByServiceWidget />
      </div>
    </section>
  );
}
