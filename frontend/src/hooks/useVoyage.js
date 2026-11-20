import { useQuery } from '@tanstack/react-query';
import { voyagesService } from '@/services/voyages.service';

/** One voyage with round dates/status, vessel and named port calls (GET /voyages/:id). */
export const useVoyage = (id) => useQuery({
  queryKey: ['voyage', id],
  queryFn:  () => voyagesService.getById(id).then(r => r.data.data),
  enabled:  !!id,
});

/** Cards of the Voyage Details page (GET /voyages/:id/summary). `revenue` is absent without permission. */
export const useVoyageSummary = (id) => useQuery({
  queryKey: ['voyage-summary', id],
  queryFn:  () => voyagesService.summary(id).then(r => r.data.data),
  enabled:  !!id,
});
