'use client';
import PageGuard from '@/components/ui/PageGuard';
import VesselForm from '@/modules/vessels/VesselForm';
export default function NewVesselPage() {
  return <PageGuard module="vessels" action="create"><VesselForm /></PageGuard>;
}
