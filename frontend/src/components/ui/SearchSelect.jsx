'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_SHOWN = 200;

/**
 * Searchable drop-down (combobox). Controlled: value + onChange(value).
 * options: [{ value, label }] (strings are accepted too). Large lists (all cities of a country) are filtered
 * client-side and only the first 200 matches are rendered.
 * Drop-in look for Select; for react-hook-form wrap it in <Controller />.
 */
export default function SearchSelect({
  label, required, error, id, value = '', onChange, options = [], placeholder = 'Select…',
  searchPlaceholder = 'Search…', disabled = false, className = '', inputClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const root = useRef(null);
  const searchRef = useRef(null);

  const opts = useMemo(() => options.map((o) => (typeof o === 'object' ? { value: o.value, label: String(o.label ?? o.value) } : { value: o, label: String(o) })), [options]);
  const selected = opts.find((o) => String(o.value) === String(value));
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => (needle ? opts.filter((o) => o.label.toLowerCase().includes(needle)) : opts), [opts, needle]);
  const shown = filtered.slice(0, MAX_SHOWN);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);

  const pick = (v) => { onChange?.(v); setOpen(false); setQ(''); };

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={root} style={{ position: 'relative' }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {label}{required && <span style={{ color: 'var(--teal)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <button
        type="button" id={id} disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        className={`input-base ${error ? 'input-error' : ''} ${inputClassName}`}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, opacity: disabled ? 0.6 : 1 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? 'inherit' : 'var(--text-muted)' }}>
          {selected ? selected.label : placeholder}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path strokeLinecap="round" d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, marginTop: 4, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
          <div style={{ padding: 8, borderBottom: '1px solid #F3F4F6' }}>
            <input
              ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter') { e.preventDefault(); if (shown[0]) pick(shown[0].value); } }}
              className="input-base" style={{ width: '100%' }}
            />
          </div>
          <ul style={{ maxHeight: 240, overflowY: 'auto', margin: 0, padding: 4, listStyle: 'none' }}>
            {value !== '' && value !== null && value !== undefined && (
              <li><button type="button" onClick={() => pick('')} style={{ width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 13, color: 'var(--text-muted)' }}>Clear selection</button></li>
            )}
            {shown.length === 0 && <li style={{ padding: '8px', fontSize: 13, color: 'var(--text-muted)' }}>No matches</li>}
            {shown.map((o) => (
              <li key={o.value}>
                <button
                  type="button" onClick={() => pick(o.value)}
                  style={{ width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 13, borderRadius: 6, background: String(o.value) === String(value) ? '#F0FDFA' : 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = String(o.value) === String(value) ? '#F0FDFA' : 'transparent'; }}
                >{o.label}</button>
              </li>
            ))}
            {filtered.length > MAX_SHOWN && <li style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)' }}>Showing {MAX_SHOWN} of {filtered.length} — keep typing to narrow</li>}
          </ul>
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 2 }}>{error}</p>}
    </div>
  );
}
