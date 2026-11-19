'use client';

import { useState } from 'react';
import LocationLevelTable from './LocationLevelTable';
import { locationsService } from '@/services/locations.service';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  {
    key: 'code', label: 'Code',
    render: (r) => r.code ? <span className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{r.code}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>,
  },
  { key: 'city', label: 'City', render: (r) => r.cityId?.name || '—' },
  { key: 'country', label: 'Country', render: (r) => r.countryId?.name || '—' },
  { key: 'currency', label: 'Local Currency', render: (r) => r.countryId?.localCurrency ? <span className="mono">{r.countryId.localCurrency}</span> : '—' },
];

export default function PortTable() {
  const [countryId, setCountryId] = useState('');
  const [cityId, setCityId] = useState('');

  const handleFilterChange = (key, val) => {
    if (key === 'countryId') { setCountryId(val); setCityId(''); }
    else if (key === 'cityId') setCityId(val);
  };

  return (
    <LocationLevelTable
      level="port"
      title="Ports"
      singular="Port"
      queryKey="ports"
      listFn={locationsService.getPorts}
      removeFn={locationsService.removePort}
      columns={COLUMNS}
      filters={[
        { key: 'countryId', level: 'country', placeholder: 'All Countries' },
        { key: 'cityId', level: 'city', placeholder: 'All Cities', parentKey: 'countryId' },
      ]}
      filterVals={{ countryId, cityId }}
      onFilterChange={handleFilterChange}
    />
  );
}
