'use client';

import { CapacityWarningsWidget, OperationalWarningsWidget } from '../widgets/AlertsWidgets';

export default function AlertsSection() {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Alerts</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CapacityWarningsWidget />
        <OperationalWarningsWidget />
      </div>
    </section>
  );
}
