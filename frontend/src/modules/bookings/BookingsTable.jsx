'use client';

import Badge from '@/components/ui/Badge';
import { getVoyageLabel } from '@/utils/voyageLabel';

const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';

/**
 * Layer 2 (operational) bookings table, extracted from BookingList (Voyage Details sprint B2).
 * Rows in, callbacks out. Each optional callback switches its feature on:
 *   selection = { selected, onToggle(id), onToggleAll() } → checkbox column
 *   onEdit(b)   → Edit link (not for Cancelled / Final Loading rows)
 *   onDelete(b) → Delete link
 *   onCancelLoaded(b) → Cancel link on Final Loading rows (FL-05: the only change a loaded booking takes; the server refuses it when invoiced)
 * Without them the table is read-only (View only), as on the Voyage page.
 */
export default function BookingsTable({ rows, onView, selection, onEdit, onDelete, onCancelLoaded }) {
  const headers = ['Booking No', 'Voyage', 'POL → POD', 'Agent', 'Partner', 'Shipper / Consignee', 'Container', 'Total Freight', 'Status', 'Discharge', 'Actions'];
  return (
    <div className="overflow-x-auto">
      {/* minWidth ensures the table scrolls internally rather than expanding the page */}
      <table className="w-full border-collapse" style={{ minWidth: 1000 }}>
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
          {rows.map(b => (
            <tr key={b._id} className="table-row">
              {selection && (
                <td className="px-4">
                  <input type="checkbox" checked={selection.selected.includes(b._id)} onChange={() => selection.onToggle(b._id)} className="w-3.5 h-3.5 cursor-pointer accent-teal-600" />
                </td>
              )}
              <td>
                <button onClick={() => onView(b)} className="mono text-xs font-bold text-teal-600 hover:text-teal-800 transition whitespace-nowrap">
                  {b.bookingNumber}
                </button>
              </td>
              <td><span className="mono text-xs font-semibold text-gray-600 whitespace-nowrap">{getVoyageLabel(b.voyageId)}</span></td>
              <td><span className="text-xs text-gray-600 whitespace-nowrap">{b.polId?.code || b.polId?.name || '—'} → {b.podId?.code || b.podId?.name || '—'}</span></td>
              <td><span className="text-xs text-gray-600">{b.agentId?.agentName}</span></td>
              <td>{b.partnerId ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 whitespace-nowrap">{b.partnerId.code || b.partnerId.name}</span> : <span className="text-[11px] text-gray-300">—</span>}</td>
              <td>
                <p className="text-xs font-medium text-gray-700 truncate max-w-[140px]">{b.shipper || '—'}</p>
                <p className="text-xs text-gray-400 truncate max-w-[140px]">{b.consignee || '—'}</p>
              </td>
              <td>
                <span className="mono text-xs text-gray-600 whitespace-nowrap">
                  {b.containerTypeId?.code}<span className="text-gray-400 ml-1">{b.containerTypeId?.size}</span>
                </span>
              </td>
              <td><span className="mono text-xs font-semibold text-teal-700 whitespace-nowrap">{fmtMoney(b.totalFreight)}</span></td>
              <td><Badge label={b.status} /></td>
              <td>
                {b.dischargeStatus ? (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    b.dischargeStatus === 'Discharged' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {b.dischargeStatus}
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-300">—</span>
                )}
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <button onClick={() => onView(b)} className="text-xs font-medium text-teal-600 hover:text-teal-800 transition whitespace-nowrap">View</button>
                  {onEdit && !['Cancelled', 'Final Loading'].includes(b.status) && (
                    <button onClick={() => onEdit(b)} className="text-xs font-medium text-gray-500 hover:text-gray-800 transition">Edit</button>
                  )}
                  {onCancelLoaded && b.status === 'Final Loading' && (
                    <button onClick={() => onCancelLoaded(b)} className="text-xs font-medium text-red-400 hover:text-red-600 transition">Cancel</button>
                  )}
                  {onDelete && (
                    <button onClick={() => onDelete(b)} className="text-xs font-medium text-red-400 hover:text-red-600 transition">Delete</button>
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
