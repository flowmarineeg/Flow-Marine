'use client';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0).toLocaleString('en-US');

export const STATUS_ORDER = ['Pending', 'Confirmed', 'Final Loading', 'Cancelled'];

function Card({ title, children }) {
  return (
    <div className="card p-4 min-w-0">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

/** "Pending 3 · Confirmed 2 · …" for one layer. */
export function StatusChips({ label, layer }) {
  return (
    <p className="text-xs text-gray-600 leading-5">
      <span className="font-semibold text-gray-700">{label}</span>{' '}
      {STATUS_ORDER.map((s, i) => (
        <span key={s}>{i > 0 && <span className="text-gray-300"> · </span>}{s} <span className="mono font-semibold">{layer?.byStatus?.[s] ?? 0}</span></span>
      ))}
    </p>
  );
}

const NEXT_NOTE = {
  'not-started': 'Voyage has not departed yet',
  underway:      'Underway',
  'at-port':     'Now at port',
  finished:      'Voyage finished',
  unknown:       '',
};

/**
 * The four cards. `summary.revenue` is absent for users without invoices:read / reports:read:
 * then the Revenue card is not rendered at all (three cards, no hint of amounts).
 */
export default function VoyageKpiCards({ summary }) {
  const { bookings, teu, revenue, nextPort } = summary;
  const next = nextPort?.next;
  const cols = revenue ? 'lg:grid-cols-4' : 'lg:grid-cols-3';

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols} gap-3 mb-4`}>
      <Card title="Bookings">
        <p className="text-2xl font-bold text-gray-800 mono mb-2">{num(bookings?.total)} <span className="text-xs font-medium text-gray-400">total</span></p>
        <StatusChips label="Estimated" layer={bookings?.estimated} />
        {bookings?.estimated?.ofWhichAllocation > 0 && (
          <p className="text-[11px] text-gray-400">of which allocation: {num(bookings.estimated.ofWhichAllocation)}</p>
        )}
        <StatusChips label="Operational" layer={bookings?.operational} />
      </Card>

      <Card title="TEU">
        <div className="space-y-1">
          <p className="text-sm text-gray-600 flex justify-between"><span>Estimated</span><span className="mono font-bold text-gray-800">{num(teu?.estimated)}</span></p>
          {teu?.ofWhichAllocation > 0 && (
            <p className="text-[11px] text-gray-400 flex justify-between pl-3"><span>of which allocation</span><span className="mono">{num(teu.ofWhichAllocation)}</span></p>
          )}
          <p className="text-sm text-gray-600 flex justify-between"><span>Operational</span><span className="mono font-bold text-gray-800">{num(teu?.operational)}</span></p>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Utilisation {Number(teu?.utilisationPct || 0).toFixed(0)}% of {num(teu?.capacityTEU)} TEU (peak onboard {num(teu?.peakOnboardTEU)})
        </p>
        {teu?.notPlaced > 0 && (
          <p className="text-xs mt-2 rounded px-2 py-1" style={{ background: '#FDF0D5', color: '#7A4A06' }}>
            {num(teu.notPlaced)} TEU are not placed on the route (old or edited data).
          </p>
        )}
      </Card>

      {revenue && (
        <Card title={`Revenue (${revenue.currency || 'USD'})`}>
          <div className="space-y-1 text-sm text-gray-600">
            <p className="flex justify-between"><span>Estimated</span><span className="mono font-bold text-gray-800">{usd(revenue.estimated)}</span></p>
            {revenue.ofWhichAllocation > 0 && (
              <p className="text-[11px] text-gray-400 flex justify-between pl-3"><span>of which allocation</span><span className="mono">{usd(revenue.ofWhichAllocation)}</span></p>
            )}
            <p className="flex justify-between"><span>Operational</span><span className="mono font-bold text-gray-800">{usd(revenue.operational)}</span></p>
            <p className="flex justify-between"><span>Pipeline</span><span className="mono font-semibold text-gray-700">{usd((revenue.pipeline?.pending || 0) + (revenue.pipeline?.confirmed || 0))}</span></p>
            <p className="flex justify-between"><span>Invoiced</span><span className="mono font-semibold text-gray-700">{usd(revenue.invoiced?.amount)}</span></p>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Operational = Final Loading only. Invoiced = {num(revenue.invoiced?.invoices)} issued invoice{revenue.invoiced?.invoices === 1 ? '' : 's'}, gross before credit/debit notes.
          </p>
        </Card>
      )}

      <Card title="Next port call">
        {next ? (
          <>
            <p className="text-lg font-bold text-gray-800 leading-6">{next.name || next.code || '—'}</p>
            <p className="text-sm text-gray-600 mt-0.5">{next.eta ? `ETA ${fmt(next.eta)}` : 'No ETA'}</p>
          </>
        ) : (
          <p className="text-sm font-semibold text-gray-600">{nextPort?.state === 'finished' ? 'No more port calls' : '—'}</p>
        )}
        {NEXT_NOTE[nextPort?.state] && <p className="text-xs text-gray-500 mt-1">{NEXT_NOTE[nextPort.state]}</p>}
        <p className="text-[11px] text-gray-400 mt-2">An estimate until actual times are entered per port.</p>
      </Card>
    </div>
  );
}
