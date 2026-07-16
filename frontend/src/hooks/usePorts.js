import { useQuery } from '@tanstack/react-query';
import { locationsService } from '@/services/locations.service';

/**
 * Shared hook for ports dropdown.
 * Sprint020 PERF-008 — staleTime: 10min (port data almost never changes).
 */
export const usePorts = () => {
  const { data, isLoading } = useQuery({
    queryKey:  ['ports-dropdown'],
    queryFn:   () => locationsService.ports({ limit: 500 }).then(r => r.data.data),
    staleTime: 10 * 60 * 1000,
  });
  return { ports: data || [], isLoading };
};
