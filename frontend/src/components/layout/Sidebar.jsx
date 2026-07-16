'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermission } from '@/context/PermissionContext';
import { useAuth } from '@/context/AuthContext';

const NAV = [
  {
    section: 'Main', items: [
      {
        label: 'Dashboard', href: '/dashboard', module: 'dashboard', icon: (
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
        )
      },
    ],
  },
  {
    section: 'Operations', items: [
      { label: 'Rounds', href: '/rounds', module: 'rounds', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" /></svg> },
      { label: 'Voyages', href: '/voyages', module: 'voyages', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M3 17l4-8 4 4 4-6 4 10" /></svg> },
      { label: 'Bookings', href: '/bookings', module: 'bookings', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
      { label: 'Expenses', href: '/expenses', module: 'expenses', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { label: 'Invoices', href: '/invoices', module: 'invoices', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
      { label: 'Tracking', href: '/tracking', module: 'tracking', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    ],
  },
  {
    section: 'Masters', items: [
      { label: 'Vessels', href: '/vessels', module: 'vessels', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
      { label: 'Agents', href: '/agents', module: 'agents', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
      { label: 'Locations', href: '/locations', module: 'locations', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="10" r="3" /><path strokeLinecap="round" d="M12 21.7C17.3 17 20 13 20 10a8 8 0 10-16 0c0 3 2.7 6.9 8 11.7z" /></svg> },
      { label: 'Container Types', href: '/container-types', module: 'containerTypes', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zm-9 5H4m11 0h5" /></svg> },
      { label: 'Expense Types', href: '/expense-types', module: 'expenseTypes', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg> },
      { label: 'Services', href: '/services', module: 'services', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
    ],
  },
  {
    section: 'Analytics', items: [
      { label: 'Reports', href: '/reports', module: 'reports', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
      { label: 'Export', href: '/export', module: 'export', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> },
    ],
  },
  {
    section: 'Administration', items: [
      { label: 'Users', href: '/users', module: 'users', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
      { label: 'Roles', href: '/roles', module: 'roles', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> },
      { label: 'Audit Log', href: '/audit-logs', module: 'auditLogs', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
    ],
  },
];

export default function Sidebar() {
  const pathname       = usePathname();
  const { isHidden, can } = usePermission();
  const { user } = useAuth();
  const isSuperAdmin   = user?.roleId?.isSystem === true;

  return (
    <aside className="sidebar hide_scrollbar" style={{ width: 240, display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0, overflowY: 'auto' }}>

      {/* Logo */}
      <div className='p-1 flex items-center justify-center' style={{ borderBottom: '1px solid var(--navy-border)' }}>
        {/* <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.2px' }}>
              Flow System
            </div>
            <div style={{ fontSize: 10.5, color: '#475569', letterSpacing: '0.04em', marginTop: 1 }}>
              OPERATIONS PLATFORM
            </div>
          </div>
        </div> */}
        <img src="/images/logo-white.png" alt="logo" className='w-60 h-30'/>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }} className="hide_scrollbar">
        {NAV.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 20 }}>
            <p className="sidebar-section-label">{section}</p>
            {items.map(({ label, href, module, icon }) => {
              // Dashboard tab: SuperAdmin only — checked by role identity, not permissions
              if (href === '/dashboard' && !isSuperAdmin) return null;
              // All other modules: use normal RBAC
              if (href !== '/dashboard' && module && (isHidden(module) || !can(module, 'read'))) return null;
              const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
              return (
                <Link key={href} href={href} className={`sidebar-link ${active ? 'active' : ''}`}>
                  <span style={{ opacity: active ? 1 : 0.7, flexShrink: 0 }}>{icon}</span>
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--navy-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          
          <div style={{ overflow: 'hidden' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </p>
            <p style={{ fontSize: 11, color: '#475569', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.roleId?.name || 'User'}
            </p>
          </div>
        </div>
       
      </div>
    </aside>
  );
}
