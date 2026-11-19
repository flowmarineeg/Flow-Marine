'use client';

import { useState } from 'react';
import LocationLevelTable from './LocationLevelTable';
import { locationsService } from '@/services/locations.service';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'port', label: 'Port', render: (r) => r.portId?.name || '—' },
];

export default function TerminalTable() {
  const [portId, setPortId] = useState('');

  return (
    <LocationLevelTable
      level="terminal"
      title="Terminals"
      singular="Terminal"
      queryKey="terminals"
      listFn={locationsService.getTerminals}
      removeFn={locationsService.removeTerminal}
      columns={COLUMNS}
      filters={[{ key: 'portId', level: 'port', placeholder: 'All Ports' }]}
      filterVals={{ portId }}
      onFilterChange={(_, val) => setPortId(val)}
    />
  );
}
