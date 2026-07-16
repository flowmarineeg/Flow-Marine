export default function LoadingSpinner({ fullPage = false }) {
  const spinner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 32, height: 32,
        border: '3px solid var(--teal-light)',
        borderTopColor: 'var(--teal)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>
    </div>
  );
  if (fullPage) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
        {spinner}
      </div>
    );
  }
  return spinner;
}
