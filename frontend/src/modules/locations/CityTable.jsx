'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import LocationLevelTable from './LocationLevelTable';
import { locationsService } from '@/services/locations.service';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'country', label: 'Country', render: (r) => r.countryId?.name || '—' },
];

export default function CityTable() {
  const [countryId, setCountryId] = useState('');

  const { data: countries } = useQuery({
    queryKey: ['countries', 'all'],
    queryFn:  () => locationsService.getCountries().then(r => r.data.data),
  });

  return (
    <LocationLevelTable
      level="city"
      title="Cities"
      singular="City"
      queryKey="cities"
      listFn={locationsService.getCities}
      removeFn={locationsService.removeCity}
      columns={COLUMNS}
      filters={[{
        key: 'countryId',
        placeholder: 'All Countries',
        options: (countries || []).map(c => ({ value: c._id, label: c.name })),
      }]}
      filterVals={{ countryId }}
      onFilterChange={(_, val) => setCountryId(val)}
    />
  );
}
