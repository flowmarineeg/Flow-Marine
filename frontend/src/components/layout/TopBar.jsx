'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermission } from '@/context/PermissionContext';
import { useAuth } from '@/context/AuthContext';
import ConfirmModal from '@/components/ui/ConfirmModal';

// Same modules, same permissions as the old sidebar — grouped into dropdowns.
const NAV = [
  { label: 'Dashboard', href: '/dashboard', module: 'dashboard' },
  {
    label: 'Operations',
    items: [
      { label: 'Routes',   href: '/routes',   module: 'services' },
      { label: 'Rounds',   href: '/rounds',   module: 'rounds' },
      { label: 'Voyages',  href: '/voyages',  module: 'voyages' },
      { label: 'Bookings', href: '/bookings', module: 'bookings' },
      { label: 'Tracking', href: '/tracking', module: 'tracking' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Expenses',   href: '/expenses',   module: 'expenses' },
      { label: 'Invoices',   href: '/invoices',   module: 'invoices' },
      { label: 'Accounting', href: '/accounting', module: 'accounting' },
    ],
  },
  {
    label: 'Master data',
    items: [
      { label: 'Vessels',           href: '/vessels',         module: 'vessels' },
      { label: 'Vessels/Agents',    href: '/agents',          module: 'agents' },
      { label: 'Agents/Customers',  href: '/customers',       module: 'customers' },
      { label: 'Partners',          href: '/partners',        module: 'partners' },
      { label: 'Locations',         href: '/locations',       module: 'locations' },
      { label: 'Container types',   href: '/container-types', module: 'containerTypes' },
      { label: 'Expense types',     href: '/expense-types',   module: 'expenseTypes' },
      { label: 'Invoice services',  href: '/services',        module: 'invoiceServices' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { label: 'Reports', href: '/reports', module: 'reports' },
      { label: 'Export',  href: '/export',  module: 'export' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Users',     href: '/users',      module: 'users' },
      { label: 'Roles',     href: '/roles',      module: 'roles' },
      { label: 'Audit log', href: '/audit-logs', module: 'auditLogs' },
    ],
  },
];

const isActive = (pathname, href) =>
  pathname === href || pathname.startsWith(href + '/');

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function TopBar() {
  const pathname = usePathname();
  const { isHidden, can } = usePermission();
  const { user, logout } = useAuth();
  const isSuperAdmin = user?.roleId?.isSystem === true;

  const [openMenu, setOpenMenu] = useState(null);   // label of the open dropdown
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const barRef = useRef(null);

  // Close menus when the route changes (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setOpenMenu(null); setMobileOpen(false); }

  // Dashboard = SuperAdmin by role identity; every other module = RBAC.
  const allowed = (item) => {
    if (item.href === '/dashboard') return isSuperAdmin;
    return item.module && !isHidden(item.module) && can(item.module, 'read');
  };

  const groups = NAV
    .map((g) => (g.items ? { ...g, items: g.items.filter(allowed) } : g))
    .filter((g) => (g.items ? g.items.length > 0 : allowed(g)));

  // Close menus on navigation, outside click, Escape.
  useEffect(() => {
    const onDown = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setOpenMenu(null); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpenMenu(null); setMobileOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); } finally { setLoggingOut(false); setConfirmOut(false); }
  };

  return (
    <>
      <header ref={barRef} className="topbar">
        {/* Brand */}
        <Link href={isSuperAdmin ? '/dashboard' : '/'} aria-label="Home" style={{ display: 'flex', alignItems: 'center', marginRight: 12, flexShrink: 0 }}>
          <img src="/images/logo-white.png" alt="Flow" style={{ height: 28, width: 'auto' }} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="Main">
          {groups.map((g) =>
            g.items ? (
              <div key={g.label} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={`topbar-trigger ${g.items.some((i) => isActive(pathname, i.href)) ? 'active' : ''}`}
                  aria-expanded={openMenu === g.label}
                  aria-haspopup="menu"
                  onClick={() => setOpenMenu(openMenu === g.label ? null : g.label)}
                >
                  {g.label} <Chevron />
                </button>
                {openMenu === g.label && (
                  <div className="topbar-menu" role="menu">
                    {g.items.map((i) => (
                      <Link key={i.href} href={i.href} role="menuitem"
                        className={`topbar-item ${isActive(pathname, i.href) ? 'active' : ''}`}>
                        {i.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link key={g.href} href={g.href}
                className={`topbar-trigger ${isActive(pathname, g.href) ? 'active' : ''}`}>
                {g.label}
              </Link>
            )
          )}
        </nav>

        <div style={{ flex: 1 }} />

        {/* User + sign out */}
        <div className="hidden sm:flex" style={{ flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2, marginRight: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#fff' }}>{user?.name}</span>
          <span style={{ fontSize: 11, color: '#9DB4CF' }}>{user?.roleId?.name || 'User'}</span>
        </div>
        <button type="button" className="topbar-trigger" onClick={() => setConfirmOut(true)} title="Sign out" aria-label="Sign out">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden md:inline">Sign out</span>
        </button>

        {/* Mobile menu button */}
        <button type="button" className="topbar-trigger topbar-menu-btn" aria-label="Menu" aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}>
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            {mobileOpen ? <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="lg:hidden" style={{
          position: 'fixed', top: 'calc(var(--topbar-h) + 3px)', left: 0, right: 0, bottom: 0,
          background: 'var(--card)', zIndex: 65, overflowY: 'auto', padding: '8px 16px 24px',
        }}>
          {groups.map((g) => (
            <div key={g.label} style={{ marginTop: 14 }}>
              {g.items ? (
                <>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 4px 10px' }}>{g.label}</p>
                  {g.items.map((i) => (
                    <Link key={i.href} href={i.href} className={`topbar-item ${isActive(pathname, i.href) ? 'active' : ''}`}>{i.label}</Link>
                  ))}
                </>
              ) : (
                <Link href={g.href} className={`topbar-item ${isActive(pathname, g.href) ? 'active' : ''}`} style={{ fontWeight: 600 }}>{g.label}</Link>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmOut}
        variant="warning"
        title="Sign out?"
        message={`You'll be signed out of your account, ${user?.name?.split(' ')[0] || 'there'}. Any unsaved changes will be lost.`}
        confirmText="Yes, sign out"
        cancelText="Stay signed in"
        loading={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => setConfirmOut(false)}
      />
    </>
  );
}
