import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { voyagesService } from '@/services/voyages.service';

/** Voyages page, level 1: one page of vessels with an open round and an open voyage. */
export const useVoyageVessels = ({ page, search }) => useQuery({
  queryKey: ['voyage-vessels', page, search],
  queryFn:  () => voyagesService.vesselOverview({ page, limit: 20, search }).then(r => r.data),
  placeholderData: keepPreviousData, // keep the previous page on screen while the next one loads
});

/** Voyages page, level 2: the open rounds and voyages of one vessel. */
export const useVoyageVesselDetail = (vesselId) => useQuery({
  queryKey: ['voyage-vessel', vesselId],
  queryFn:  () => voyagesService.vesselOverviewDetail(vesselId).then(r => r.data.data),
  enabled:  !!vesselId,
});
