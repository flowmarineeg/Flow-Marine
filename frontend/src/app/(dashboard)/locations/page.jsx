'use client';
import { useState } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import PageHeader from '@/components/ui/PageHeader';
import CountryTable from '@/modules/locations/CountryTable';
import CityTable from '@/modules/locations/CityTable';
import PortTable from '@/modules/locations/PortTable';
import TerminalTable from '@/modules/locations/TerminalTable';

const TABS = [
  { key: 'countries', label: 'Countries', Component: CountryTable },
  { key: 'cities',    label: 'Cities',    Component: CityTable },
  { key: 'ports',     label: 'Ports',     Component: PortTable },
  { key: 'terminals', label: 'Terminals', Component: TerminalTable },
];

function LocationsContent() {
  const [tab, setTab] = useState('countries');
  const Active = TABS.find(t => t.key === tab)?.Component;
  return (
    <div className="animate-fadeIn">
      <PageHeader title="Locations" subtitle="Manage the Country → City → Port → Terminal hierarchy" />
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 16px', fontSize: 13.5, fontWeight: 500,
            background: 'none', border: 'none',
            borderBottom: tab === t.key ? '2px solid var(--teal)' : '2px solid transparent',
            color: tab === t.key ? 'var(--teal)' : 'var(--text-secondary)',
            cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>
      {Active && <Active />}
    </div>
  );
}

export default function LocationsPage() {
  return <PageGuard module="locations"><LocationsContent /></PageGuard>;
}
