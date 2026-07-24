'use client';

import { VoyageProfitabilityWidget, TotalExpensesWidget } from '../widgets/FinancialWidgets';

export default function FinancialSection() {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Financial</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VoyageProfitabilityWidget />
        <TotalExpensesWidget />
      </div>
    </section>
  );
}
