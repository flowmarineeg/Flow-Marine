'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
];

export default function PortTable() {
  const [countryId, setCountryId] = useState('');
  const [cityId, setCityId] = useState('');

  const { data: countries } = useQuery({
    queryKey: ['countries', 'all'],
    queryFn:  () => locationsService.getCountries().then(r => r.data.data),
  });

  const { data: cities } = useQuery({
    queryKey: ['cities', 'byCountry', countryId],
    queryFn:  () => locationsService.getCities({ countryId }).then(r => r.data.data),
    enabled:  !!countryId,
  });

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
        {
          key: 'countryId',
          placeholder: 'All Countries',
          options: (countries || []).map(c => ({ value: c._id, label: c.name })),
        },
        {
          key: 'cityId',
          placeholder: 'All Cities',
          options: (cities || []).map(c => ({ value: c._id, label: c.name })),
        },
      ]}
      filterVals={{ countryId, cityId }}
      onFilterChange={handleFilterChange}
    />
  );
}
