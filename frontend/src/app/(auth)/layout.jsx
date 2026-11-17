// Shared shell for login, forgot-password, reset-password and accept-invite.
// Left: brand panel (lg and up) with the route motif. Right: the page's own form card.
// On phones the brand panel collapses to a slim navy header so the form comes first.

import RouteLottie from '@/components/layout/RouteLottie';

export default function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <img src="/images/logo-white.png" alt="Flow Marine" style={{ height: 34, width: 'auto', alignSelf: 'flex-start' }} />

        <div className="auth-brand-copy">
          <h2 style={{ margin: 0, fontSize: 34, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.5px', color: '#fff' }}>
            Rounds, voyages and bookings,<br />on one screen.
          </h2>
          <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: '#B7C9DE', maxWidth: 420 }}>
            Track capacity leg by leg, close each round with the books balanced, and settle with partners without a spreadsheet.
          </p>
          <div style={{ marginTop: 36 }}><RouteLottie /></div>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: '#7F9AB8' }}>Flow Marine Operations Platform</p>
      </aside>

      <main className="auth-main">{children}</main>
    </div>
  );
}
