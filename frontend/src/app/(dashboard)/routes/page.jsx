'use client';
import PageGuard from '@/components/ui/PageGuard';
import ServiceList from '@/modules/services/ServiceList';
export default function RoutesPage() {
  return <PageGuard module="services"><ServiceList /></PageGuard>;
}
