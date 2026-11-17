'use client';

import { VoyageProfitabilityWidget, TotalExpensesWidget } from '../widgets/FinancialWidgets';

export default function FinancialSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Financial</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VoyageProfitabilityWidget />
        <TotalExpensesWidget />
      </div>
    </section>
  );
}
