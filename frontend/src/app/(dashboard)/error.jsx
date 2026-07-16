'use client';

import { useRouter } from 'next/navigation';

export default function DashboardError({ error, reset }) {
  const router = useRouter();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', padding: 24, textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: '#FEE2E2', display: 'flex', alignItems: 'center',
        justifyContent: 'center', marginBottom: 16,
      }}>
        <svg width="22" height="22" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
      </div>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
        Page error
      </h2>
      <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px', maxWidth: 320 }}>
        This page encountered an error. Use the sidebar to navigate elsewhere or try reloading.
      </p>
      {process.env.NODE_ENV === 'development' && (
        <pre style={{
          fontSize: 11, color: '#9CA3AF', background: '#F9FAFB',
          padding: 10, borderRadius: 6, maxWidth: 400, overflow: 'auto',
          marginBottom: 20, textAlign: 'left',
        }}>
          {error?.message}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => reset()} style={{
          padding: '8px 18px', borderRadius: 8, border: 'none',
          background: '#0D9488', color: '#fff', fontWeight: 600,
          fontSize: 13, cursor: 'pointer',
        }}>
          Try again
        </button>
        <button onClick={() => router.push('/rounds')} style={{
          padding: '8px 18px', borderRadius: 8, border: '1px solid #E5E7EB',
          background: '#fff', color: '#374151', fontWeight: 600,
          fontSize: 13, cursor: 'pointer',
        }}>
          Go to Rounds
        </button>
      </div>
    </div>
  );
}
