import { useQuery } from '@tanstack/react-query';
import { servicesService } from '@/services/services.service';

/**
 * Shared hook for services dropdown.
 * Sprint020 PERF-008 — staleTime: 10min (master data, rarely changes).
 */
export const useServices = () => {
  const { data, isLoading } = useQuery({
    queryKey:  ['services-dropdown'],
    queryFn:   () => servicesService.list({ limit: 200 }).then(r => r.data.data),
    staleTime: 10 * 60 * 1000,
  });
  return { services: data || [], isLoading };
};
