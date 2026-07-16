'use client';

import { useQuery } from '@tanstack/react-query';
import { locationsService } from '@/services/locations.service';
import Select from '../ui/Select';

/**
 * Reusable cascading location picker: Country -> City -> Port -> Terminal.
 * Selecting a parent clears all child selections.
 * Reused in RouteLegs, Booking, and Tracking forms.
 */
export default function LocationSelect({
  value = { countryId: '', cityId: '', portId: '', terminalId: '' },
  onChange,
  showTerminal = true,
  required = false,
  disabled = false,
}) {
  const { countryId = '', cityId = '', portId = '', terminalId = '' } = value;

  const { data: countries } = useQuery({
    queryKey: ['locationSelect', 'countries'],
    queryFn:  () => locationsService.getCountries().then(r => r.data.data),
  });

  const { data: cities } = useQuery({
    queryKey: ['locationSelect', 'cities', countryId],
    queryFn:  () => locationsService.getCities({ countryId }).then(r => r.data.data),
    enabled:  !!countryId,
  });

  const { data: ports } = useQuery({
    queryKey: ['locationSelect', 'ports', cityId],
    queryFn:  () => locationsService.getPorts({ cityId }).then(r => r.data.data),
    enabled:  !!cityId,
  });

  const { data: terminals } = useQuery({
    queryKey: ['locationSelect', 'terminals', portId],
    queryFn:  () => locationsService.getTerminals({ portId }).then(r => r.data.data),
    enabled:  !!portId && showTerminal,
  });

  const handleCountryChange = (e) => {
    onChange({ countryId: e.target.value, cityId: '', portId: '', terminalId: '' });
  };
  const handleCityChange = (e) => {
    onChange({ countryId, cityId: e.target.value, portId: '', terminalId: '' });
  };
  const handlePortChange = (e) => {
    onChange({ countryId, cityId, portId: e.target.value, terminalId: '' });
  };
  const handleTerminalChange = (e) => {
    onChange({ countryId, cityId, portId, terminalId: e.target.value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Select
        label="Country" required={required} disabled={disabled}
        value={countryId} onChange={handleCountryChange}
        options={(countries || []).map(c => ({ value: c._id, label: `${c.name} (${c.code})` }))}
        placeholder="Select country…"
      />
      {countryId && (
        <Select
          label="City" required={required} disabled={disabled}
          value={cityId} onChange={handleCityChange}
          options={(cities || []).map(c => ({ value: c._id, label: c.name }))}
          placeholder="Select city…"
        />
      )}
      {cityId && (
        <Select
          label="Port" required={required} disabled={disabled}
          value={portId} onChange={handlePortChange}
          options={(ports || []).map(p => ({ value: p._id, label: p.name }))}
          placeholder="Select port…"
        />
      )}
      {showTerminal && portId && (
        <Select
          label="Terminal" disabled={disabled}
          value={terminalId} onChange={handleTerminalChange}
          options={(terminals || []).map(t => ({ value: t._id, label: t.name }))}
          placeholder="Select terminal (optional)…"
        />
      )}
    </div>
  );
}
