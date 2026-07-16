'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import LocationLevelTable from './LocationLevelTable';
import { locationsService } from '@/services/locations.service';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'port', label: 'Port', render: (r) => r.portId?.name || '—' },
];

export default function TerminalTable() {
  const [portId, setPortId] = useState('');

  const { data: ports } = useQuery({
    queryKey: ['ports', 'all'],
    queryFn:  () => locationsService.getPorts().then(r => r.data.data),
  });

  return (
    <LocationLevelTable
      level="terminal"
      title="Terminals"
      singular="Terminal"
      queryKey="terminals"
      listFn={locationsService.getTerminals}
      removeFn={locationsService.removeTerminal}
      columns={COLUMNS}
      filters={[{
        key: 'portId',
        placeholder: 'All Ports',
        options: (ports || []).map(p => ({ value: p._id, label: p.name })),
      }]}
      filterVals={{ portId }}
      onFilterChange={(_, val) => setPortId(val)}
    />
  );
}
