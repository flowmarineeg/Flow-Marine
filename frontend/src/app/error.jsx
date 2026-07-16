'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F8FAFC' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: 24, textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: '#FEE2E2', display: 'flex', alignItems: 'center',
            justifyContent: 'center', marginBottom: 20,
          }}>
            <svg width="26" height="26" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 24px', maxWidth: 360 }}>
            An unexpected error occurred. Please try again or contact support if the problem persists.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <pre style={{
              fontSize: 11, color: '#9CA3AF', background: '#F3F4F6',
              padding: 12, borderRadius: 8, maxWidth: 480, overflow: 'auto',
              marginBottom: 24, textAlign: 'left',
            }}>
              {error?.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => reset()} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#0D9488', color: '#fff', fontWeight: 600,
              fontSize: 14, cursor: 'pointer',
            }}>
              Try again
            </button>
            <a href="/" style={{
              padding: '10px 20px', borderRadius: 8, border: '1px solid #E5E7EB',
              background: '#fff', color: '#374151', fontWeight: 600,
              fontSize: 14, textDecoration: 'none', display: 'inline-block',
            }}>
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
