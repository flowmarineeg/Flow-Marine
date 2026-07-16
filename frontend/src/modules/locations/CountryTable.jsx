'use client';

import LocationLevelTable from './LocationLevelTable';
import { locationsService } from '@/services/locations.service';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  {
    key: 'code', label: 'Code',
    render: (r) => <span className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>{r.code}</span>,
  },
];

export default function CountryTable() {
  return (
    <LocationLevelTable
      level="country"
      title="Countries"
      singular="Country"
      queryKey="countries"
      listFn={locationsService.getCountries}
      removeFn={locationsService.removeCountry}
      columns={COLUMNS}
      filters={[]}
      filterVals={{}}
      onFilterChange={() => {}}
    />
  );
}
