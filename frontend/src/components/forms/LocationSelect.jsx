'use client';

import LocationPicker from './LocationPicker';

/**
 * Reusable cascading location picker: Country -> City -> Port -> Terminal.
 * Selecting a parent clears all child selections. Each level is searchable and loads on type (20 per request).
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

  const handleCountryChange = (v) => { onChange({ countryId: v, cityId: '', portId: '', terminalId: '' }); };
  const handleCityChange = (v) => { onChange({ countryId, cityId: v, portId: '', terminalId: '' }); };
  const handlePortChange = (v) => { onChange({ countryId, cityId, portId: v, terminalId: '' }); };
  const handleTerminalChange = (v) => { onChange({ countryId, cityId, portId, terminalId: v }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <LocationPicker
        level="country" label="Country" required={required} disabled={disabled}
        value={countryId} onChange={handleCountryChange}
        placeholder="Select country…" searchPlaceholder="Search country…"
      />
      {countryId && (
        <LocationPicker
          level="city" label="City" required={required} disabled={disabled}
          value={cityId} onChange={handleCityChange} parent={{ countryId }}
          placeholder="Select city…" searchPlaceholder="Search city…"
        />
      )}
      {cityId && (
        <LocationPicker
          level="port" label="Port" required={required} disabled={disabled}
          value={portId} onChange={handlePortChange} parent={{ cityId }}
          placeholder="Select port…" searchPlaceholder="Search port…"
        />
      )}
      {showTerminal && portId && (
        <LocationPicker
          level="terminal" label="Terminal" disabled={disabled}
          value={terminalId} onChange={handleTerminalChange} parent={{ portId }}
          placeholder="Select terminal (optional)…" searchPlaceholder="Search terminal…"
        />
      )}
    </div>
  );
}
