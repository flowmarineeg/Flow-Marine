'use client';

// Sprint 044 — shared booking-list summary: booking count, total revenue,
// and a per-container-type breakdown (count + amount per type). Reused by:
//   - Invoice creation (Voyage/Round scope) — replaces the old checkbox-
//     selectable EligibleBookingsTable now that every eligible booking is
//     always auto-included, with no partial selection.
//   - Agent Details "Bookings" tab — replaces the old one-row-per-booking
//     BookingsLedger table.
// Computed entirely client-side from data already fetched by the caller —
// no request of its own, no individual booking numbers shown (by design,
// per both call sites' requirements).

const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00';

export default function BookingsSummaryCard({
  bookings = [],
  getAmount = (b) => b.freightAmount ?? b.totalFreight ?? 0,
  getContainerType = (b) => b.containerType || 'Unspecified',
  emptyMessage = 'No Final Loading bookings found.',
}) {
  if (!bookings.length) {
    return <p className="text-sm text-gray-400 italic py-6 text-center">{emptyMessage}</p>;
  }

  const totalRevenue = bookings.reduce((sum, b) => sum + (getAmount(b) || 0), 0);

  const byType = new Map();
  bookings.forEach(b => {
    const type = getContainerType(b);
    if (!byType.has(type)) byType.set(type, { type, count: 0, amount: 0 });
    const entry = byType.get(type);
    entry.count  += 1;
    entry.amount += getAmount(b) || 0;
  });
  const typeRows = [...byType.values()].sort((a, b) => b.amount - a.amount);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-6 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold text-teal-500 uppercase tracking-wider">Bookings</p>
          <p className="text-lg font-bold text-teal-800">{bookings.length}</p>
        </div>
        <div className="border-l border-teal-200 pl-6">
          <p className="text-[10px] font-semibold text-teal-500 uppercase tracking-wider">Total Revenue</p>
          <p className="text-lg font-bold text-teal-800">{fmtMoney(totalRevenue)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="table-header">
                {['Container Type', 'Count', 'Amount'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {typeRows.map(r => (
                <tr key={r.type} className="table-row">
                  <td className="text-xs font-semibold text-gray-700">{r.type}</td>
                  <td className="text-xs text-gray-600">{r.count}</td>
                  <td className="text-xs text-gray-700 font-medium">{fmtMoney(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
