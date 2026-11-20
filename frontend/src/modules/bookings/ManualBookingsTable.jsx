'use client';

import Badge from '@/components/ui/Badge';
import { getVoyageLabel } from '@/utils/voyageLabel';

const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';

/**
 * Layer 1 (estimated / manual) bookings table, extracted from BookingList (Voyage Details sprint B2).
 * Rows in, callbacks out: `selection` adds the checkbox column, `onDelete` the Delete link;
 * without them the table is read-only (View only), as on the Voyage page.
 * `Type` = the kind of the Layer 1 row; an old row without a kind reads as Estimate.
 */
export default function ManualBookingsTable({ rows, onView, selection, onDelete }) {
  const headers = ['Booking No', 'Type', 'Voyage', 'Agent', 'Partner', 'POL → POD', 'Rows', 'Total TEU', 'Total Freight', 'Status', 'Actions'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 960 }}>
        <thead>
          <tr className="table-header">
            {selection && (
              <th className="w-10 px-4 py-2.5">
                <input type="checkbox" checked={selection.selected.length === rows.length && rows.length > 0} onChange={selection.onToggleAll} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
              </th>
            )}
            {headers.map(h => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(m => (
            <tr key={m._id} className="table-row">
              {selection && (
                <td className="px-4">
                  <input type="checkbox" checked={selection.selected.includes(m._id)} onChange={() => selection.onToggle(m._id)} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
                </td>
              )}
              <td>
                <button onClick={() => onView(m)} className="mono text-xs font-bold text-purple-600 hover:text-purple-800 transition whitespace-nowrap">
                  {m.bookingNumber}
                </button>
              </td>
              <td>{m.kind === 'Allocation'
                ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: '#FFE8DC', color: '#8A2D08' }}>Allocation</span>
                : <span className="text-[11px] text-gray-500">Estimate</span>}</td>
              <td><span className="mono text-xs font-semibold text-gray-600 whitespace-nowrap">{getVoyageLabel(m.voyageId)}</span></td>
              <td><span className="text-xs text-gray-600">{m.agentId?.agentName}</span></td>
              <td>{m.partnerId ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 whitespace-nowrap">{m.partnerId.code || m.partnerId.name}</span> : <span className="text-[11px] text-gray-300">—</span>}</td>
              <td className="text-xs text-gray-600 whitespace-nowrap">
                {m.polId?.code || m.polId?.name || '—'} → {m.podId?.code || m.podId?.name || '—'}
              </td>
              <td className="text-xs text-gray-600">{m.cargoRows?.length || 0}</td>
              <td className="mono text-xs text-gray-600">{m.totalTEU?.toLocaleString() || '—'}</td>
              <td><span className="mono text-xs font-semibold text-teal-700 whitespace-nowrap">{fmtMoney(m.totalFreight)}</span></td>
              <td><Badge label={m.status} /></td>
              <td>
                <div className="flex items-center gap-2">
                  <button onClick={() => onView(m)} className="text-xs font-medium text-teal-600 hover:text-teal-800 transition whitespace-nowrap">View</button>
                  {onDelete && (
                    <button onClick={() => onDelete(m)} className="text-xs font-medium text-red-400 hover:text-red-600 transition">Delete</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
