'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { bookingsService } from '@/services/bookings.service';
import { usePermission }   from '@/context/PermissionContext';
import Badge         from '@/components/ui/Badge';
import Modal         from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useState } from 'react';
import ManualBookingForm from '@/modules/bookings/ManualBookingForm';

const fmt      = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
const fmtNum   = (n) => n != null ? Number(n).toLocaleString() : '—';

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-[13.5px] font-medium text-gray-700 ${mono ? 'font-mono' : ''}`}>
        {value || <span className="text-gray-300">—</span>}
      </p>
    </div>
  );
}

export default function ManualBookingDetail({ booking, onMutated }) {
  const router   = useRouter();
  const qc       = useQueryClient();
  const { can }  = usePermission();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen,  setDelOpen]  = useState(false);

  const isCancelled    = booking.status === 'Cancelled';
  const isFinalLoading = booking.status === 'Final Loading';
  const isLocked       = isCancelled || isFinalLoading;
  const canEdit        = can('bookings', 'update') && !isLocked;
  const canCancel      = can('bookings', 'update') && !isLocked;
  const canDelete      = can('bookings', 'delete');

  const deleteMutation = useMutation({
    mutationFn: () => bookingsService.removeManual(booking._id),
    onSuccess: () => {
      toast.success('Estimated booking deleted');
      qc.invalidateQueries(['manual-bookings']);
      router.push('/bookings?tab=manual');
    },
    onError: (e) => showErrorToast(e, 'delete'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => bookingsService.updateManual(booking._id, { status: 'Cancelled' }),
    onSuccess: () => {
      toast.success('Estimated booking cancelled');
      qc.invalidateQueries(['manual-bookings']);
      qc.invalidateQueries(['manual-booking', booking._id]);
      onMutated?.();
    },
    onError: (e) => showErrorToast(e, 'cancel'),
  });

  return (
    <>
      <div className="card p-6 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="mono text-lg font-bold text-gray-800">{booking.bookingNumber}</span>
              <Badge label={booking.status} />
              <span className="text-[10px] font-bold bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Estimated</span>
            </div>
            <p className="text-sm text-gray-400">Created {fmt(booking.createdAt)}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canEdit && (
              <button onClick={() => setEditOpen(true)} className="btn btn-secondary btn-sm">Edit</button>
            )}
            {canCancel && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="btn btn-secondary btn-sm text-amber-600 hover:bg-amber-50 border-amber-200"
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
            {canDelete && (
              <button onClick={() => setDelOpen(true)} className="btn btn-danger btn-sm">Delete</button>
            )}
          </div>
        </div>

        {/* Locked banners */}
        {isFinalLoading && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-sm text-blue-700 font-medium">This booking is on the Final Loading manifest and cannot be edited.</p>
          </div>
        )}
        {isCancelled && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600">This booking is cancelled.</p>
          </div>
        )}

        {/* Total Freight banner */}
        <div className="bg-gradient-to-r from-teal-50 to-teal-100/50 border border-teal-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-teal-600 uppercase tracking-wider">Total Freight</p>
            <p className="text-xs text-teal-500 mt-0.5">{booking.totalUnits} unit{booking.totalUnits !== 1 ? 's' : ''} · {booking.totalTEU} TEU</p>
          </div>
          <span className="text-3xl font-bold text-teal-700 mono">{fmtMoney(booking.totalFreight)}</span>
        </div>

        {/* Header info */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <InfoRow label="Voyage"    value={booking.voyageId?.voyageNumber ? `${booking.voyageId.voyageNumber} (${booking.voyageId?.voyageName || 'unnamed'})` : null} mono />
          <InfoRow label="Agent"     value={[booking.agentId?.agentCode, booking.agentId?.agentName].filter(Boolean).join(' — ')} />
          <InfoRow label="POL"       value={booking.polId ? `${booking.polId.name}${booking.polId.code ? ` (${booking.polId.code})` : ''}` : null} />
          <InfoRow label="POD"       value={booking.podId ? `${booking.podId.name}${booking.podId.code ? ` (${booking.podId.code})` : ''}` : null} />
          <InfoRow label="Total TEU" value={fmtNum(booking.totalTEU)} />
          <InfoRow label="Total Units" value={fmtNum(booking.totalUnits)} />
        </div>

        {/* Cargo rows */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Cargo Rows</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  {['#', 'Container Type', 'Qty', 'Rate', 'DG', 'DG Value', 'Commodity', 'VGM (kg)', 'Row Total'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(booking.cargoRows || []).map((row, i) => {
                  const ct = row.containerTypeId;
                  return (
                    <tr key={row._id || i} className="border-b border-gray-50">
                      <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                      <td className="py-2 px-3">
                        <span className="mono text-xs font-semibold text-gray-700">{ct?.code || '—'}</span>
                        {ct?.size && <span className="text-gray-400 ml-1 text-[11px]">{ct.size}</span>}
                      </td>
                      <td className="py-2 px-3 text-gray-700">{row.quantity?.toLocaleString()}</td>
                      <td className="py-2 px-3 text-gray-700 mono">{fmtMoney(row.rate)}</td>
                      <td className="py-2 px-3">
                        {row.dg
                          ? <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">DG</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 px-3 text-gray-600">{row.dgValue || <span className="text-gray-300">—</span>}</td>
                      <td className="py-2 px-3 text-gray-600">{row.commodity || <span className="text-gray-300">—</span>}</td>
                      <td className="py-2 px-3 text-gray-600">{row.vgm != null ? `${row.vgm.toLocaleString()} kg` : <span className="text-gray-300">—</span>}</td>
                      <td className="py-2 px-3 font-semibold text-teal-700 mono">{fmtMoney(row.rowTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Remarks */}
        {booking.remarks && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Remarks</p>
            <p className="text-sm text-gray-600 leading-relaxed">{booking.remarks}</p>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Estimated Booking — ${booking.bookingNumber}`} size="xl">
        {editOpen && (
          <ManualBookingForm
            item={booking}
            onSuccess={() => {
              setEditOpen(false);
              qc.invalidateQueries(['manual-booking', booking._id]);
              qc.invalidateQueries(['manual-bookings']);
              onMutated?.();
            }}
            onCancel={() => setEditOpen(false)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        title="Delete Estimated Booking"
        message={`Delete estimated booking "${booking.bookingNumber}"? This cannot be undone.`}
      />
    </>
  );
}
