'use client';

import { useState, forwardRef } from 'react';

/**
 * PasswordInput — drop-in replacement for <Input type="password">
 * Adds an eye icon button to toggle visibility.
 * Accepts all the same props as the base Input component.
 * Compatible with React Hook Form via forwardRef.
 */
const PasswordInput = forwardRef(function PasswordInput(
  { label, error, id, required, className = '', placeholder, ...props },
  ref
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {label}
          {required && <span style={{ color: 'var(--teal)', marginLeft: 3 }}>*</span>}
        </label>
      )}

      {/* Input wrapper — relative so the eye button can be positioned inside */}
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          ref={ref}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder || '••••••••'}
          {...props}
          className={`input-base ${error ? 'input-error' : ''}`}
          style={{ paddingRight: 40 }}  /* make room for the eye button */
        />

        {/* Eye toggle button */}
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          tabIndex={-1}           /* skip in tab order — don't interrupt form flow */
          aria-label={visible ? 'Hide password' : 'Show password'}
          style={{
            position:   'absolute',
            right:      10,
            top:        '50%',
            transform:  'translateY(-50%)',
            background: 'none',
            border:     'none',
            padding:    4,
            cursor:     'pointer',
            color:      'var(--text-muted)',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--teal)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          {visible ? (
            /* Eye-off icon — password is visible, click to hide */
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L6.59 6.59m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            /* Eye icon — password is hidden, click to show */
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 2 }}>{error}</p>
      )}
    </div>
  );
});

export default PasswordInput;
