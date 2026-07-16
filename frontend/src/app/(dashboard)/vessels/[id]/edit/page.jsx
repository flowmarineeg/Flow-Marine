'use client';
import { use } from 'react';
import PageGuard from '@/components/ui/PageGuard';
import VesselForm from '@/modules/vessels/VesselForm';
export default function EditVesselPage({ params }) {
  const { id } = use(params);
  return <PageGuard module="vessels" action="update"><VesselForm id={id} /></PageGuard>;
}
