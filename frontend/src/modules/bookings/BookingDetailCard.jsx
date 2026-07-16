'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { bookingsService } from '@/services/bookings.service';
import { usePermission }   from '@/context/PermissionContext';
import Badge         from '@/components/ui/Badge';
import Modal         from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useState } from 'react';
import BookingForm from '@/modules/bookings/BookingForm';

const fmt      = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';

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

export default function BookingDetailCard({ booking, onMutated }) {
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
    mutationFn: () => bookingsService.remove(booking._id),
    onSuccess: () => {
      toast.success('Booking deleted');
      qc.invalidateQueries(['bookings']);
      router.push('/bookings');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Delete failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => bookingsService.update(booking._id, { status: 'Cancelled' }),
    onSuccess: () => {
      toast.success('Booking cancelled');
      qc.invalidateQueries(['bookings']);
      qc.invalidateQueries(['booking', booking._id]);
      onMutated?.();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Cancel failed'),
  });

  return (
    <>
      <div className="card p-6 flex flex-col gap-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="mono text-lg font-bold text-gray-800">{booking.bookingNumber}</span>
              <Badge label={booking.status} />
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
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel Booking'}
              </button>
            )}
            {canDelete && (
              <button onClick={() => setDelOpen(true)} className="btn btn-danger btn-sm">Delete</button>
            )}
          </div>
        </div>

        {/* ── Locked banners ─────────────────────────────────────────── */}
        {isFinalLoading && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p className="text-sm text-blue-700 font-medium">
              This booking is confirmed on the Final Loading manifest and cannot be edited.
            </p>
          </div>
        )}
        {isCancelled && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <p className="text-sm text-red-600">This booking is cancelled and cannot be edited.</p>
          </div>
        )}

        {/* ── Total Freight banner ───────────────────────────────────── */}
        <div className="bg-gradient-to-r from-teal-50 to-teal-100/50 border border-teal-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-teal-600 uppercase tracking-wider">Total Freight</p>
            <p className="text-xs text-teal-500 mt-0.5">
              {booking.quantity} × {fmtMoney(booking.freightRate)} / unit
            </p>
          </div>
          <span className="text-3xl font-bold text-teal-700 mono">{fmtMoney(booking.totalFreight)}</span>
        </div>

        {/* ── Info grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
          <InfoRow label="Voyage"         value={booking.voyageId?.voyageNumber} mono />
          <InfoRow label="Agent"          value={[booking.agentId?.agentCode, booking.agentId?.agentName].filter(Boolean).join(' — ')} />
          <InfoRow label="Container Type" value={booking.containerTypeId ? `${booking.containerTypeId.code} (${booking.containerTypeId.size} ${booking.containerTypeId.type})` : null} />
          <InfoRow label="Shipper"        value={booking.shipper} />
          <InfoRow label="Consignee"      value={booking.consignee} />
          <InfoRow label="Carrier Name"   value={booking.carrierName} />
          <InfoRow label="POL"            value={booking.polId ? `${booking.polId.name}${booking.polId.code ? ` (${booking.polId.code})` : ''}` : null} />
          <InfoRow label="POD"            value={booking.podId ? `${booking.podId.name}${booking.podId.code ? ` (${booking.podId.code})` : ''}` : null} />
          <InfoRow label="Commodity"      value={booking.commodity} />
          <InfoRow label="Quantity"       value={booking.quantity?.toLocaleString()} />
          <InfoRow label="Freight Rate"   value={fmtMoney(booking.freightRate)} />
          {/* slotCount removed */}
        </div>

        {/* ── Remarks ────────────────────────────────────────────────── */}
        {booking.remarks && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Remarks</p>
            <p className="text-sm text-gray-600 leading-relaxed">{booking.remarks}</p>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Booking — ${booking.bookingNumber}`} size="lg">
        {editOpen && (
          <BookingForm
            item={booking}
            onSuccess={() => {
              setEditOpen(false);
              qc.invalidateQueries(['booking', booking._id]);
              qc.invalidateQueries(['bookings']);
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
        title="Delete Booking"
        message={`Delete booking "${booking.bookingNumber}"? This cannot be undone.`}
      />
    </>
  );
}
