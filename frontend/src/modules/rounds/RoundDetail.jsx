'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { roundsService } from '@/services/rounds.service';
import { usePermission } from '@/context/PermissionContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import RoundForm from '@/modules/rounds/RoundForm';
import RoundVoyageList from '@/modules/rounds/RoundVoyageList';
import Badge from '@/components/ui/Badge';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Status transition indicator
const NEXT_STATUS = {
  Planned:   'Active',
  Active:    'Completed',
  Completed: null,
  Cancelled: null,
};

export default function RoundDetailPage({ roundId }) {
  const router     = useRouter();
  const qc         = useQueryClient();
  const { can }    = usePermission();
  const [editOpen, setEditOpen] = useState(false);

  const { data: round, isLoading, isError } = useQuery({
    queryKey: ['round', roundId],
    queryFn:  () => roundsService.getById(roundId).then(r => r.data.data),
  });

  const advanceMutation = useMutation({
    mutationFn: (status) => roundsService.update(roundId, { status }),
    onSuccess: (res) => {
      toast.success(`Round moved to ${res.data.data?.status}`);
      qc.invalidateQueries(['round', roundId]);
      qc.invalidateQueries(['rounds']);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Update failed'),
  });

  if (isLoading) return <LoadingSpinner fullPage />;
  if (isError || !round) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-sm">Round not found</p>
        <button onClick={() => router.push('/rounds')} className="mt-3 text-sm text-teal-600 hover:underline">← Back to Rounds</button>
      </div>
    );
  }

  const nextStatus = NEXT_STATUS[round.status];

  return (
    <div className="animate-fadeIn">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => router.push('/rounds')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Rounds
        </button>
        <span className="text-gray-200">/</span>
        <span className="mono text-sm font-bold text-gray-600">{round.roundNumber}</span>
      </div>

      {/* Header card */}
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">

          {/* Left: info */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center flex-shrink-0">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" className="text-teal-600">
                <circle cx="12" cy="12" r="10"/>
                <path strokeLinecap="round" d="M12 6v6l4 2"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="mono text-lg font-bold text-gray-800">{round.roundNumber}</span>
                <Badge label={round.status} />
              </div>
              <p className="text-sm font-semibold text-gray-600 mb-0.5">
                <span className="mono text-teal-600">{round.serviceId?.serviceCode}</span>
                <span className="text-gray-400 mx-1.5">·</span>
                {round.serviceId?.serviceName}
              </p>
              <p className="text-xs text-gray-400">
                Vessel:&nbsp;
                <span className="mono font-semibold text-gray-500">{round.vesselId?.vesselCode}</span>
                &nbsp;{round.vesselId?.vesselName}
              </p>
            </div>
          </div>

          {/* Right: dates + actions */}
          <div className="flex flex-col items-end gap-3">
            {/* Date strip */}
            <div className="flex items-center gap-4 text-sm">
              <div className="text-right">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Start</p>
                <p className="font-semibold text-gray-700">{fmt(round.startDate)}</p>
              </div>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-gray-300">
                <path strokeLinecap="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">End</p>
                <p className="font-semibold text-gray-700">{fmt(round.endDate)}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {can('rounds', 'update') && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="btn btn-secondary btn-sm"
                >
                  Edit Round
                </button>
              )}
              {nextStatus && can('rounds', 'update') && (
                <button
                  onClick={() => advanceMutation.mutate(nextStatus)}
                  disabled={advanceMutation.isPending}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  {advanceMutation.isPending ? (
                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  ) : (
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  )}
                  Mark {nextStatus}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        {round.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-gray-600">{round.notes}</p>
          </div>
        )}
      </div>

      {/* Voyages section */}
      <div className="card overflow-hidden">
        <RoundVoyageList roundId={roundId} round={round} />
      </div>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Round" size="md">
        {editOpen && (
          <RoundForm
            item={round}
            onSuccess={() => {
              setEditOpen(false);
              qc.invalidateQueries(['round', roundId]);
              qc.invalidateQueries(['rounds']);
            }}
            onCancel={() => setEditOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}
