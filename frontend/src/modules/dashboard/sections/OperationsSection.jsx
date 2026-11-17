'use client';

import { ActiveRoundsWidget, ActiveVoyagesWidget, FleetUtilisationWidget } from '../widgets/OperationsWidgets';

export default function OperationsSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Operations</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ActiveRoundsWidget />
        <ActiveVoyagesWidget />
      </div>
      <FleetUtilisationWidget />
    </section>
  );
}
