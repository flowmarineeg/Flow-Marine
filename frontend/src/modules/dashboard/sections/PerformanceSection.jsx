'use client';

import { TopAgentsWidget, TopRoutesWidget, VoyageLeaderboardWidget } from '../widgets/PerformanceWidgets';

export default function PerformanceSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Performance</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopAgentsWidget />
        <TopRoutesWidget />
      </div>
      <VoyageLeaderboardWidget />
    </section>
  );
}
