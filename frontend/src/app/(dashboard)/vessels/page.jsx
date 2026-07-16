'use client';
import PageGuard from '@/components/ui/PageGuard';
import VesselList from '@/modules/vessels/VesselList';
export default function VesselsPage() {
  return <PageGuard module="vessels"><VesselList /></PageGuard>;
}
