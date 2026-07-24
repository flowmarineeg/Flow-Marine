'use client';

import { ActiveRoundsWidget, ActiveVoyagesWidget, FleetUtilisationWidget } from '../widgets/OperationsWidgets';

export default function OperationsSection() {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Operations</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ActiveRoundsWidget />
        <ActiveVoyagesWidget />
      </div>
      <FleetUtilisationWidget />
    </section>
  );
}
