'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * FormPage — a full-width working page for adding / editing / viewing a record.
 * Drop-in replacement for <Modal> on add/edit screens (same props), so the
 * form is a page, not a pop-up. Pop-ups stay only for confirming an action.
 *
 * - Fills the area under the top bar; page behind it does not scroll.
 * - Browser Back and Esc both close it (history entry pushed while open).
 * - `size` sets the width of the form sheet: sm 560 · md 760 · lg 980 · xl 1280.
 */
let ignorePop = false; // set when we pop our own history entry
const WIDTH = { sm: 560, md: 760, lg: 980, xl: 1280 };

export default function FormPage({ open, onClose, title, children, size = 'md', footer }) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Back button closes the form instead of leaving the screen.
    window.history.pushState({ formPage: true }, '');
    let closedByPop = false;
    const onPop = () => {
      if (ignorePop) { ignorePop = false; return; }
      closedByPop = true; closeRef.current?.();
    };
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      // Closed from a button: drop the history entry we added.
      if (!closedByPop && window.history.state?.formPage) {
        ignorePop = true; setTimeout(() => { ignorePop = false; }, 300);
        window.history.back();
      }
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <section className="form-page" role="region" aria-labelledby="form-page-title">
      <div className="form-page-bar">
        <button
          type="button"
          onClick={() => onClose?.()}
          className="btn btn-secondary btn-sm"
          aria-label="Back"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <h1 id="form-page-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--navy)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </h1>
      </div>

      <div className="form-page-body">
        <div className="form-page-sheet" style={{ maxWidth: WIDTH[size] ?? WIDTH.md }}>
          {children}
          {footer && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </section>,
    document.body
  );
}
