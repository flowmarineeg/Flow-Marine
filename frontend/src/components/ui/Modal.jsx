'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal — renders via React portal into document.body, so it is never
 * clipped by ancestor overflow:hidden/clip stacking contexts.
 *
 * Props (unchanged — no callers need updating):
 *   open        : boolean                     – controls visibility
 *   onClose     : () => void                  – backdrop click or ESC or ✕
 *   title       : string                      – header title
 *   children    : ReactNode                   – scrollable body content
 *   size        : 'sm'|'md'|'lg'|'xl'         – panel max-width (default 'md')
 *   footer      : ReactNode                   – optional pinned footer row
 *   hideHeader  : boolean                     – hide the header bar entirely
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  hideHeader = false,
}) {
  /* ── body scroll lock ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  /* ── ESC to close ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  /* ── panel max-width ──────────────────────────────────────────────────── */
  const maxW = { sm: '440px', md: '600px', lg: '800px', xl: '1040px' }[size] ?? '600px';

  const overlay = (
    <>
      {/* keyframes — injected once per open */}
      <style>{`
        @keyframes _modal_in {
          from { opacity: 0; transform: translateY(14px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        ._modal_panel {
          animation: _modal_in 0.22s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>

      {/* ── Overlay backdrop ───────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        style={{
          position:       'fixed',
          inset:          0,
          zIndex:         9999,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '24px 16px',
          background:     'rgba(10, 20, 35, 0.65)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      >
        {/* ── Panel ──────────────────────────────────────────────────── */}
        <div
          className="_modal_panel"
          style={{
            position:     'relative',
            display:      'flex',
            flexDirection:'column',
            width:        '100%',
            maxWidth:     maxW,
            maxHeight:    'calc(100vh - 48px)',
            background:   '#ffffff',
            borderRadius: '20px',
            border:       '1px solid #E4E7EC',
            boxShadow:    '0 24px 64px rgba(0,0,0,0.20), 0 4px 16px rgba(0,0,0,0.10)',
            overflow:     'hidden',
          }}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          {!hideHeader && (
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              flexShrink:     0,
              padding:        '16px 20px',
              borderBottom:   '1px solid #F3F4F6',
              background:     '#ffffff',
              gap:            12,
            }}>
              <h2
                id="modal-title"
                style={{
                  margin:     0,
                  fontSize:   15,
                  fontWeight: 600,
                  color:      '#111827',
                  lineHeight: 1.4,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {title}
              </h2>

              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  flexShrink:     0,
                  width:          32,
                  height:         32,
                  borderRadius:   8,
                  border:         'none',
                  background:     'transparent',
                  cursor:         'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  color:          '#9CA3AF',
                  transition:     'background 0.15s, color 0.15s',
                  padding:        0,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#F3F4F6';
                  e.currentTarget.style.color      = '#111827';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color      = '#9CA3AF';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          )}

          {/* ── Body ───────────────────────────────────────────────── */}
          <div style={{
            flex:           1,
            overflowY:      'auto',
            padding:        '20px',
            scrollbarWidth: 'thin',
            scrollbarColor: '#E4E7EC transparent',
          }}>
            {children}
          </div>

          {/* ── Footer (optional) ──────────────────────────────────── */}
          {footer && (
            <div style={{
              flexShrink:     0,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'flex-end',
              gap:            8,
              padding:        '14px 20px',
              borderTop:      '1px solid #F3F4F6',
              background:     '#FAFBFC',
            }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );

  // createPortal escapes every ancestor stacking context completely
  return createPortal(overlay, document.body);
}
