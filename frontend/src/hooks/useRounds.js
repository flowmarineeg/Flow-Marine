import { useQuery } from '@tanstack/react-query';
import { roundsService } from '@/services/rounds.service';

/**
 * Shared hook for rounds dropdown.
 * Sprint020 PERF-008 — staleTime: 5min.
 */
export const useRounds = (params = {}, { enabled = true } = {}) => {
  const { data, isLoading } = useQuery({
    queryKey:  ['rounds-dropdown', params],
    queryFn:   () => roundsService.list({ limit: 200, ...params }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
  return { rounds: data || [], isLoading };
};
