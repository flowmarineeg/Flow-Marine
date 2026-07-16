'use client';
import { useState, useEffect } from 'react';

export default function SearchBar({ value, onChange, placeholder = 'Search…', debounce = 400 }) {
  const [local, setLocal] = useState(value || '');

  useEffect(() => {
    const t = setTimeout(() => onChange(local), debounce);
    return () => clearTimeout(t);
  }, [local]);

  useEffect(() => { setLocal(value || ''); }, [value]);

  return (
    <div style={{ position: 'relative' }}>
      <svg
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
        width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
      </svg>
      <input
        value={local}
        onChange={e => setLocal(e.target.value)}
        placeholder={placeholder}
        className="input-base"
        style={{ paddingLeft: 32 }}
      />
    </div>
  );
}
