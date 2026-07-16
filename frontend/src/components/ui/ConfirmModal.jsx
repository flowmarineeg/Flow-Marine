'use client';

import { useEffect, useRef } from 'react';

/**
 * ConfirmModal — generic confirmation dialog
 *
 * Props:
 *   open        {boolean}  — whether modal is visible
 *   onConfirm   {fn}       — called when user clicks the confirm button
 *   onCancel    {fn}       — called when user clicks Cancel or the backdrop
 *   title       {string}   — dialog heading
 *   message     {string}   — body text
 *   confirmText {string}   — confirm button label (default 'Confirm')
 *   cancelText  {string}   — cancel button label  (default 'Cancel')
 *   variant     {string}   — 'danger' | 'warning' | 'info' (controls icon + button color)
 *   loading     {boolean}  — shows spinner on confirm button while action is in flight
 */
export default function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  title        = 'Are you sure?',
  message      = 'This action cannot be undone.',
  confirmText  = 'Confirm',
  cancelText   = 'Cancel',
  variant      = 'danger',
  loading      = false,
}) {
  const cancelRef = useRef(null);

  // Focus the Cancel button when modal opens — safer default for destructive actions
  useEffect(() => {
    if (open) setTimeout(() => cancelRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const colors = {
    danger:  { icon: '#DC2626', iconBg: '#FEE2E2', btn: '#DC2626', btnHover: '#B91C1C' },
    warning: { icon: '#D97706', iconBg: '#FEF3C7', btn: '#D97706', btnHover: '#B45309' },
    info:    { icon: '#2563EB', iconBg: '#DBEAFE', btn: '#2563EB', btnHover: '#1D4ED8' },
  };
  const c = colors[variant] || colors.danger;

  const icons = {
    danger: (
      <svg width="24" height="24" fill="none" stroke={c.icon} strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
    warning: (
      <svg width="24" height="24" fill="none" stroke={c.icon} strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
    info: (
      <svg width="24" height="24" fill="none" stroke={c.icon} strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
          animation: 'fadeIn 0.15s ease',
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        style={{
          position:  'fixed',
          top:       '50%',
          left:      '50%',
          transform: 'translate(-50%, -50%)',
          zIndex:    1001,
          width:     '100%',
          maxWidth:  400,
          padding:   '0 16px',
          animation: 'slideUp 0.18s ease',
        }}
      >
        <div style={{
          background:   'var(--card)',
          borderRadius: 16,
          padding:      '28px 28px 24px',
          boxShadow:    '0 20px 60px rgba(0,0,0,0.25)',
          display:      'flex',
          flexDirection:'column',
          alignItems:   'center',
          textAlign:    'center',
          gap:          0,
        }}>
          {/* Icon */}
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: c.iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, flexShrink: 0,
          }}>
            {icons[variant] || icons.danger}
          </div>

          {/* Title */}
          <h2 id="confirm-modal-title" style={{
            fontSize: 17, fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
            lineHeight: 1.3,
          }}>
            {title}
          </h2>

          {/* Message */}
          <p style={{
            fontSize: 13.5, color: 'var(--text-muted)',
            margin: '0 0 24px', lineHeight: 1.6,
          }}>
            {message}
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            {/* Cancel — left, secondary */}
            <button
              ref={cancelRef}
              onClick={onCancel}
              disabled={loading}
              style={{
                flex: 1, padding: '10px 16px',
                borderRadius: 9, border: '1.5px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--card)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)';     e.currentTarget.style.background = 'var(--surface)'; }}
            >
              {cancelText}
            </button>

            {/* Confirm — right, colored */}
            <button
              onClick={onConfirm}
              disabled={loading}
              style={{
                flex: 1, padding: '10px 16px',
                borderRadius: 9, border: 'none',
                background: c.btn,
                color: '#fff',
                fontSize: 13.5, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = c.btnHover; }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = c.btn; }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Please wait…
                </>
              ) : confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
