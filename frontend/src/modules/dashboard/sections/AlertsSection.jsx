'use client';

import { CapacityWarningsWidget, OperationalWarningsWidget } from '../widgets/AlertsWidgets';

export default function AlertsSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Alerts</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CapacityWarningsWidget />
        <OperationalWarningsWidget />
      </div>
    </section>
  );
}
