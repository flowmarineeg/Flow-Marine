'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ConfirmModal from '@/components/ui/ConfirmModal';

const getTitle = (pathname) => {
  const map = {
    '/dashboard':       'Dashboard',
    '/vessels':         'Vessels',
    '/agents':          'Agents',
    '/locations':       'Locations',
    '/container-types': 'Container Types',
    '/expense-types':   'Expense Types',
    '/services':        'Services',
    '/rounds':          'Rounds',
    '/voyages':         'Voyages',
    '/bookings':        'Bookings',
    '/expenses':        'Expenses',
    '/invoices':        'Invoices',
    '/tracking':        'Vessel Tracking',
    '/reports':         'Reports',
    '/export':          'Export',
    '/users':           'Users',
    '/roles':           'Roles & Permissions',
    '/audit-logs':      'Audit Log',
  };
  for (const [key, val] of Object.entries(map)) {
    if (pathname === key || pathname.startsWith(key + '/')) return val;
  }
  return 'Logistics SaaS';
};

export default function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const title    = getTitle(pathname);

  const [showConfirm, setShowConfirm] = useState(false);
  const [loggingOut,  setLoggingOut]  = useState(false);

  const handleLogoutConfirm = async () => {
    setLoggingOut(true);
    try { await logout(); } finally { setLoggingOut(false); setShowConfirm(false); }
  };

  return (
    <>
      <header style={{
        height: 56, background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px', flexShrink: 0,
      }}>
        {/* Page title */}
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </span>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Role pill */}
          <span style={{
            fontSize: 11, fontWeight: 500,
            background: 'var(--teal-light)', color: 'var(--teal-dark)',
            padding: '3px 10px', borderRadius: 99,
          }}>
            {user?.roleId?.name || 'User'}
          </span>
          
          {/* Sign out button */}
          <button
            onClick={() => setShowConfirm(true)}
            title="Sign out"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor   = '#FCA5A5';
              e.currentTarget.style.background    = '#FEF2F2';
              e.currentTarget.style.color         = '#DC2626';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor   = 'var(--border)';
              e.currentTarget.style.background    = 'transparent';
              e.currentTarget.style.color         = 'var(--text-muted)';
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </header>

      {/* Sign-out confirmation modal */}
      <ConfirmModal
        open={showConfirm}
        variant="warning"
        title="Sign out?"
        message={`You'll be signed out of your account, ${user?.name?.split(' ')[0] || 'there'}. Any unsaved changes will be lost.`}
        confirmText="Yes, sign out"
        cancelText="Stay signed in"
        loading={loggingOut}
        onConfirm={handleLogoutConfirm}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
