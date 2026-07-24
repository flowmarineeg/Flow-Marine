'use client';

import { TopAgentsWidget, TopRoutesWidget, VoyageLeaderboardWidget } from '../widgets/PerformanceWidgets';

export default function PerformanceSection() {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Performance</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopAgentsWidget />
        <TopRoutesWidget />
      </div>
      <VoyageLeaderboardWidget />
    </section>
  );
}
