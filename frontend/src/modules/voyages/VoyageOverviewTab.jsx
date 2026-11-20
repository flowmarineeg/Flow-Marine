'use client';

import Badge from '@/components/ui/Badge';
import { StatusChips } from '@/modules/voyages/VoyageKpiCards';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0).toLocaleString('en-US');

const PORT_STATE = { done: 'Passed', current: 'At port', next: 'Next', upcoming: 'Upcoming' };

function Row({ label, value }) {
  return (
    <p className="flex justify-between text-sm text-gray-600 py-1 border-b border-gray-100 last:border-0">
      <span>{label}</span><span className="mono font-semibold text-gray-800">{value}</span>
    </p>
  );
}

/** Overview tab: status chips per layer, TEU split, revenue breakdown (only with permission), port calls table. */
export default function VoyageOverviewTab({ summary }) {
  const { bookings, teu, revenue, ports } = summary;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
      <div className="card p-4 min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Bookings by status</p>
        <StatusChips label="Estimated" layer={bookings?.estimated} />
        {bookings?.estimated?.ofWhichAllocation > 0 && (
          <p className="text-xs text-gray-400 mt-1">Of which allocation: {num(bookings.estimated.ofWhichAllocation)} (all statuses)</p>
        )}
        <StatusChips label="Operational" layer={bookings?.operational} />
        <p className="text-xs text-gray-400 mt-2">{num(bookings?.total)} bookings in total, Cancelled included.</p>
      </div>

      <div className="card p-4 min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">TEU</p>
        <Row label="Estimated (not Cancelled)" value={num(teu?.estimated)} />
        <Row label="   of which allocation" value={num(teu?.ofWhichAllocation)} />
        <Row label="Operational (Pending, Confirmed, Final Loading)" value={num(teu?.operational)} />
        <Row label="Vessel capacity" value={num(teu?.capacityTEU)} />
        <Row label="Peak onboard" value={num(teu?.peakOnboardTEU)} />
        <Row label="Utilisation" value={`${Number(teu?.utilisationPct || 0).toFixed(0)}%`} />
      </div>

      {revenue && (
        <div className="card p-4 min-w-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Revenue ({revenue.currency || 'USD'})</p>
          <Row label="Estimated (Layer 1, not Cancelled)" value={usd(revenue.estimated)} />
          <Row label="   of which allocation" value={usd(revenue.ofWhichAllocation)} />
          <Row label="Operational (Final Loading only)" value={usd(revenue.operational)} />
          <Row label="Pipeline: Pending" value={usd(revenue.pipeline?.pending)} />
          <Row label="Pipeline: Confirmed" value={usd(revenue.pipeline?.confirmed)} />
          <Row label={`Invoiced (${num(revenue.invoiced?.invoices)} invoices, gross before notes)`} value={usd(revenue.invoiced?.amount)} />
        </div>
      )}

      <div className={`card overflow-hidden min-w-0 ${revenue ? '' : 'lg:col-span-1'}`}>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 pt-4 pb-2">Port calls</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 420 }}>
            <thead>
              <tr className="table-header">{['#', 'Port', 'ETA', 'ETD', 'State'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {(ports || []).map(p => (
                <tr key={`${p.legKey}-${p.index}`} className="table-row">
                  <td className="mono text-xs text-gray-400">{p.index + 1}</td>
                  <td>
                    <span className="text-sm text-gray-700">{p.name || '—'}</span>
                    {p.code && <span className="ml-1 mono text-[10px] text-gray-400">{p.code}</span>}
                  </td>
                  <td className="text-xs text-gray-600">{fmt(p.eta)}</td>
                  <td className="text-xs text-gray-600">{fmt(p.etd)}</td>
                  <td>{p.state === 'current' ? <Badge label="At Port" /> : <span className="text-xs text-gray-500">{PORT_STATE[p.state] || '—'}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
