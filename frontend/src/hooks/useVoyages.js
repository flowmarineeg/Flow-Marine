import { useQuery } from '@tanstack/react-query';
import { voyagesService } from '@/services/voyages.service';

/**
 * Shared hook for voyages dropdown.
 * Sprint020 PERF-008/013 — staleTime: 5min.
 */
export const useVoyages = (params = {}) => {
  const { data, isLoading } = useQuery({
    queryKey:  ['voyages-dropdown', params],
    queryFn:   () => voyagesService.list({ limit: 200, ...params }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  return { voyages: data || [], isLoading };
};
