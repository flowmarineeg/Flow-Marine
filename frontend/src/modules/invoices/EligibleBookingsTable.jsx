'use client';

// Sprint 033 Decision 6 — whenever a Voyage or Round invoice is composed,
// show every eligible Final Loading booking in a selectable table: Booking
// Number, Container, Voyage, Round, Freight, Invoice Status, Amount Paid,
// Remaining Amount — so the user always understands why the total is what
// it is. Every row here is, by construction, not-yet-invoiced (the
// eligible-bookings endpoint already excludes anything claimed by another
// non-cancelled invoice — see BOOKING–INVOICE OWNERSHIP).

const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';

export default function EligibleBookingsTable({ bookings, selected, onToggle }) {
  if (!bookings.length) {
    return <p className="text-sm text-gray-400 italic py-6 text-center">No eligible Final Loading bookings found for this selection.</p>;
  }

  const total = bookings
    .filter(b => selected.includes(b.bookingId))
    .reduce((sum, b) => sum + b.freightAmount, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="table-header">
                <th></th>
                {['Booking No', 'Container', 'Voyage', 'Round', 'Freight', 'Invoice Status', 'Paid', 'Remaining'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.bookingId} className="table-row">
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(b.bookingId)}
                      onChange={() => onToggle(b.bookingId)}
                      className="w-4 h-4 accent-teal-500 cursor-pointer"
                    />
                  </td>
                  <td><span className="mono text-xs font-semibold text-teal-600">{b.bookingNumber}</span></td>
                  <td className="mono text-xs text-gray-600">{b.containerNumber || '—'}</td>
                  <td className="mono text-xs text-gray-500">{b.voyageNumber ? `${b.voyageNumber} (${b.voyageName || 'unnamed'})` : '—'}</td>
                  <td className="mono text-xs text-gray-500">{b.roundNumber ? `${b.roundNumber} (${b.roundName || 'unnamed'})` : '—'}</td>
                  <td className="text-xs text-gray-700 font-medium">{fmtMoney(b.freightAmount)}</td>
                  <td><span className="text-[11px] text-gray-400">Not Invoiced</span></td>
                  <td className="text-xs text-gray-300">$0.00</td>
                  <td className="text-xs text-gray-700">{fmtMoney(b.freightAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2 text-sm">
          <span className="text-teal-700">Selected total: </span>
          <span className="font-bold text-teal-800">{fmtMoney(total)}</span>
          <span className="text-teal-500 text-xs ml-1">({selected.length} booking{selected.length !== 1 ? 's' : ''})</span>
        </div>
      </div>
    </div>
  );
}
