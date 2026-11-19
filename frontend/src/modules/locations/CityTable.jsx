'use client';

import { useState } from 'react';
import LocationLevelTable from './LocationLevelTable';
import { locationsService } from '@/services/locations.service';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'country', label: 'Country', render: (r) => r.countryId?.name || '—' },
];

export default function CityTable() {
  const [countryId, setCountryId] = useState('');

  return (
    <LocationLevelTable
      level="city"
      title="Cities"
      singular="City"
      queryKey="cities"
      listFn={locationsService.getCities}
      removeFn={locationsService.removeCity}
      columns={COLUMNS}
      filters={[{ key: 'countryId', level: 'country', placeholder: 'All Countries' }]}
      filterVals={{ countryId }}
      onFilterChange={(_, val) => setCountryId(val)}
    />
  );
}
