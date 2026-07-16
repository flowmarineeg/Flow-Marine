'use client';
import { use } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import VesselDetail from '@/modules/vessels/VesselDetail';
export default function VesselDetailPage({ params }) {
  const { id } = use(params);
  return <PageGuard module="vessels"><VesselDetail id={id} /></PageGuard>;
}
