'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import { PermissionProvider } from '@/context/PermissionContext';

export default function Providers({ children }) {
  // Sprint020 FE-001: create QueryClient inside useState so each React tree
  // gets its own instance — avoids cross-request cache pollution in App Router.
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry:              1,
        refetchOnWindowFocus: false,
        staleTime:          60_000,  // 60s — reduces refetches on navigation
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PermissionProvider>
          {children}
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        </PermissionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
