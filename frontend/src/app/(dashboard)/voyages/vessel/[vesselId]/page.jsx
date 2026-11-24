'use client';
import { use } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import VoyageVesselDetail from '@/modules/voyages/VoyageVesselDetail';
export default function VoyageVesselPage({ params }) {
  const { vesselId } = use(params);
  return <PageGuard module="voyages"><VoyageVesselDetail vesselId={vesselId} /></PageGuard>;
}
