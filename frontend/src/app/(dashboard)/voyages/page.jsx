'use client';
import PageGuard from '@/components/ui/PageGuard';
import VoyageList from '@/modules/voyages/VoyageList';
export default function VoyagesPage() {
  return <PageGuard module="voyages"><VoyageList /></PageGuard>;
}
