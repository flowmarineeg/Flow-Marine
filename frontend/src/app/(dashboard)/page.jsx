'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// (dashboard) root — redirect to /dashboard
export default function DashboardRootPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, []);
  return null;
}
