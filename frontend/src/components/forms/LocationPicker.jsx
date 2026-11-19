'use client';

import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { locationsService } from '@/services/locations.service';
import SearchSelect from '../ui/SearchSelect';

const LEVELS = {
  country:  { list: locationsService.getCountries,  one: locationsService.getCountry,  label: (c) => `${c.name} (${c.code})` },
  city:     { list: locationsService.getCities,     one: locationsService.getCity,     label: (c) => c.name },
  port:     { list: locationsService.getPorts,      one: locationsService.getPort,     label: (p) => (p.code ? `${p.name} (${p.code})` : p.name) },
  terminal: { list: locationsService.getTerminals,  one: locationsService.getTerminal, label: (t) => t.name },
};
const PAGE = 20;

const useDebounced = (value, ms = 300) => {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
};

/**
 * Searchable country / city / port / terminal picker for large master data: loads on type (20 per request),
 * filtered by the parent selection, and shows the saved value when editing (fetched by id).
 *   level   'country' | 'city' | 'port' | 'terminal'
 *   value   the _id (or, with valueField="name", the stored name)
 *   parent  filters sent to the API, e.g. { countryId } for cities, { cityId } for ports, { portId } for terminals
 * Extra props (label, required, error, id, disabled, placeholder, searchPlaceholder, className) go to SearchSelect.
 */
export default function LocationPicker({ level, value = '', onChange, parent = {}, valueField = '_id', ...rest }) {
  const cfg = LEVELS[level];
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const byName = valueField === 'name';
  const filters = Object.fromEntries(Object.entries(parent).filter(([, v]) => v));

  const list = useQuery({
    queryKey: ['locPick', level, filters, term],
    queryFn: () => cfg.list({ ...filters, search: term, limit: PAGE }).then((r) => r.data),
    enabled: opened && !rest.disabled,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });

  // the saved value, by id, so it shows even when it is not in the first 20 results
  const one = useQuery({
    queryKey: ['locOne', level, value],
    queryFn: () => cfg.one(value).then((r) => r.data.data),
    enabled: !!value && !byName,
    staleTime: 5 * 60 * 1000,
  });

  const items = list.data?.data || [];
  const options = items.map((i) => ({ value: byName ? i.name : i._id, label: cfg.label(i) }));
  const selectedLabel = byName ? value : (one.data ? cfg.label(one.data) : undefined);

  return (
    <SearchSelect
      {...rest}
      value={value || ''}
      onChange={(v) => onChange?.(v, items.find((i) => (byName ? i.name : i._id) === v) || (one.data && one.data._id === v ? one.data : null))}
      options={options}
      selectedLabel={selectedLabel}
      onSearch={setSearch}
      onOpenChange={(o) => { if (o) setOpened(true); }}
      loading={list.isFetching}
      total={list.data?.total}
    />
  );
}
