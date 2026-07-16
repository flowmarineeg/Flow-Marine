import { useQuery } from '@tanstack/react-query';
import { agentsService } from '@/services/agents.service';

/**
 * Shared hook for agents dropdown.
 * Sprint020 PERF-008/013 — replaces repeated limit:200 fetches across pages.
 * staleTime: 5min — agents rarely change during a session.
 */
export const useAgents = (params = {}) => {
  const { data, isLoading } = useQuery({
    queryKey:  ['agents-dropdown', params],
    queryFn:   () => agentsService.list({ limit: 200, status: 'Active', ...params }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  return { agents: data || [], isLoading };
};
