export default function EmptyState({ title = 'No records found', message = 'Try adjusting your filters or create a new record.' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56,
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
      }}>
        <svg width="24" height="24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{title}</p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 280, lineHeight: 1.6 }}>{message}</p>
    </div>
  );
}
