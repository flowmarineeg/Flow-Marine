import Button from './Button';

export default function ConfirmDialog({ open, onClose, onConfirm, title = 'Are you sure?', message, confirmLabel = 'Delete', loading = false }) {
  if (!open) return null;
  return (
    <div className="modal-overlay animate-fadeIn" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: 420,
          margin: 16,
          padding: 28,
        }}
      >
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: '#FEE2E2', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <svg width="20" height="20" fill="none" stroke="#DC2626" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          {title}
        </h3>
        {message && (
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
