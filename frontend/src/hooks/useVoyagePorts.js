import { useQuery } from '@tanstack/react-query';
import { bookingsService } from '@/services/bookings.service';

/**
 * Shared hook for voyage-specific port lookup.
 * Sprint020 PERF-008 — only fires when voyageId is provided.
 * staleTime: 5min — voyage route legs don't change often.
 */
export const useVoyagePorts = (voyageId) => {
  const { data, isLoading } = useQuery({
    queryKey:  ['voyage-ports', voyageId],
    queryFn:   () => bookingsService.getVoyagePorts(voyageId).then(r => r.data.data),
    enabled:   !!voyageId,
    staleTime: 5 * 60 * 1000,
  });
  return { ports: data || [], isLoading };
};
