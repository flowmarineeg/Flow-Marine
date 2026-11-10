import { useQuery } from '@tanstack/react-query';
import { bookingsService } from '@/services/bookings.service';
import { useAuth } from '@/context/AuthContext';

/**
 * Pick-lists for every booking screen (agents, open rounds, container types and, once a round is chosen,
 * the round's ports). Served by /bookings/lookups so partner users, who cannot reach the agents / rounds
 * modules, get the same forms. Also tells whether the signed-in user is a partner user.
 */
export const useBookingLookups = (roundId) => {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey:  ['booking-lookups', roundId || null],
    queryFn:   () => bookingsService.lookups(roundId).then(r => r.data.data),
    staleTime: 60 * 1000,
  });
  return {
    agents:         data?.agents || [],
    rounds:         data?.rounds || [],
    containerTypes: data?.containerTypes || [],
    ports:          data?.ports || [],
    partners:       data?.partners || [],
    isLoading,
    isPartnerUser:  user?.roleId?.isPartnerRole === true,
  };
};
