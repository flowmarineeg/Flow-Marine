import { useQuery } from '@tanstack/react-query';
import { containerTypesService } from '@/services/containerTypes.service';

/**
 * Shared hook for container types dropdown.
 * Sprint020 PERF-008 — staleTime: 10min (changes very rarely).
 */
export const useContainerTypes = () => {
  const { data, isLoading } = useQuery({
    queryKey:  ['container-types-dropdown'],
    queryFn:   () => containerTypesService.list({ limit: 200 }).then(r => r.data.data),
    staleTime: 10 * 60 * 1000,
  });
  return { containerTypes: data || [], isLoading };
};
