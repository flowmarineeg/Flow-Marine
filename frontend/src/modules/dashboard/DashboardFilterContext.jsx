'use client';

import { createContext, useContext, useMemo, useState } from 'react';

/**
 * Sprint 039 — Global Dashboard Filter Bar (Refinement 1).
 *
 * One shared context — { roundId, voyageId, serviceId, agentId,
 * dateFrom, dateTo } — provided once at the Dashboard page's root.
 * Every Widget reads only the fields relevant to its own backing
 * report/service and ignores the rest; the filter bar itself fetches
 * nothing — it is pure shared state, per sprints/039-sprint.txt
 * Section 3.3.
 */

const DashboardFilterContext = createContext(null);

const EMPTY_FILTERS = {
  roundId: '', voyageId: '', serviceId: '', agentId: '', dateFrom: '', dateTo: '',
};

export function DashboardFilterProvider({ children }) {
  const [filters, setFiltersState] = useState(EMPTY_FILTERS);

  const setFilter = (key, value) => {
    setFiltersState(f => {
      const next = { ...f, [key]: value };
      // Round → Voyage cascade: clearing/changing Round invalidates the
      // previously-selected Voyage, same convention every report page's
      // own Round→Voyage dropdown already follows.
      if (key === 'roundId') next.voyageId = '';
      return next;
    });
  };

  const clearFilters = () => setFiltersState(EMPTY_FILTERS);

  const value = useMemo(() => ({ ...filters, setFilter, clearFilters }), [filters]);

  return (
    <DashboardFilterContext.Provider value={value}>
      {children}
    </DashboardFilterContext.Provider>
  );
}

export function useDashboardFilters() {
  const ctx = useContext(DashboardFilterContext);
  if (!ctx) throw new Error('useDashboardFilters must be used within a DashboardFilterProvider');
  return ctx;
}
