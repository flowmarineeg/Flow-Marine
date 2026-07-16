'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { voyagesService } from '@/services/voyages.service';
import { usePermission } from '@/context/PermissionContext';
import Badge        from '@/components/ui/Badge';
import Modal        from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import VoyageEditForm from '@/modules/voyages/VoyageEditForm';
import VoyageAddForm  from '@/modules/voyages/VoyageAddForm';

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
const fmtDT = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const dash  = <span className="text-gray-300">—</span>;

// ─── Type chip ────────────────────────────────────────────────────────────────
function TypeChip({ isManual }) {
  return isManual ? (
    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
      Manual
    </span>
  ) : (
    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
      Auto
    </span>
  );
}

// ─── Date cell ────────────────────────────────────────────────────────────────
function DateCell({ value, actual }) {
  if (!value) return <td className="px-3 py-2">{dash}</td>;
  return (
    <td className={`px-3 py-2 text-xs ${actual ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
      {fmtDT(value)}
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RoundVoyageList({ roundId, round }) {
  const qc      = useQueryClient();
  const { can } = usePermission();

  const [editTarget,   setEditTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [addOpen,      setAddOpen]      = useState(false);

  // Load voyages for this round
  const { data: voyages = [], isLoading } = useQuery({
    queryKey: ['round-voyages', roundId],
    queryFn:  () => voyagesService.list({ roundId, limit: 200 }).then(r => r.data.data),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => voyagesService.remove(id),
    onSuccess: () => {
      toast.success('Voyage deleted');
      setDeleteTarget(null);
      qc.invalidateQueries(['round-voyages', roundId]);
      qc.invalidateQueries(['round', roundId]);
      qc.invalidateQueries(['voyages']);
    },
    onError: (e) => {
      toast.error(e.response?.data?.message || 'Delete failed');
      setDeleteTarget(null);
    },
  });

  // Check if any voyage has a non-empty voyageCode (to decide whether to show that column)
  const hasAnyCodes = voyages.some(v => v.voyageCode);
  // Check if any voyage has ETP
  const hasAnyEtp   = voyages.some(v => v.etp);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <span className="text-sm">Loading voyages…</span>
      </div>
    );
  }

  return (
    <>
      {/* ── Section header with Add button ─────────────────────────────── */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Voyages</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {voyages.length} voyage{voyages.length !== 1 ? 's' : ''} — auto-generated + manually added
          </p>
        </div>
        {can('voyages', 'create') && (
          <button
            onClick={() => setAddOpen(true)}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" d="M12 5v14M5 12h14"/>
            </svg>
            Add Voyage
          </button>
        )}
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {voyages.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
          </svg>
          <p className="text-sm">No voyages yet.</p>
          {can('voyages', 'create') && (
            <button onClick={() => setAddOpen(true)} className="mt-3 text-sm text-teal-600 hover:text-teal-800 font-medium transition">
              + Add the first voyage
            </button>
          )}
        </div>
      )}

      {/* ── Voyage table ────────────────────────────────────────────────── */}
      {voyages.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="table-header text-[11px]">
                <th className="!py-2 w-8">#</th>
                <th className="!py-2">Type</th>
                <th className="!py-2">Voyage No</th>
                {hasAnyCodes && <th className="!py-2">Code</th>}
                <th className="!py-2 min-w-[130px]">POL</th>
                <th className="!py-2 min-w-[130px]">POD</th>
                <th className="!py-2 min-w-[120px]">ETD</th>
                <th className="!py-2 min-w-[120px]">ETA</th>
                {hasAnyEtp && <th className="!py-2 min-w-[120px]">ETP</th>}
                <th className="!py-2 min-w-[120px]">ATD</th>
                <th className="!py-2 min-w-[120px]">ATA</th>
                <th className="!py-2">Status</th>
                <th className="!py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {voyages.map((v) => (
                <tr key={v._id} className="table-row">

                  {/* Sequence */}
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full">
                      {String(v.sequence).padStart(2, '0')}
                    </span>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-2">
                    <TypeChip isManual={v.isManual} />
                  </td>

                  {/* Voyage number */}
                  <td className="px-3 py-2">
                    <span className="mono text-[12px] font-bold text-gray-700">{v.voyageNumber}</span>
                  </td>

                  {/* Voyage Code (conditional column) */}
                  {hasAnyCodes && (
                    <td className="px-3 py-2">
                      {v.voyageCode
                        ? <span className="mono text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded">{v.voyageCode}</span>
                        : dash}
                    </td>
                  )}

                  {/* POL */}
                  <td className="px-3 py-2">
                    <div>
                      <span className="font-medium text-gray-800">{v.polId?.name}</span>
                      {v.polId?.code && (
                        <span className="ml-1 mono text-[10px] text-gray-400">{v.polId.code}</span>
                      )}
                    </div>
                  </td>

                  {/* POD */}
                  <td className="px-3 py-2">
                    <div>
                      <span className="font-medium text-gray-800">{v.podId?.name}</span>
                      {v.podId?.code && (
                        <span className="ml-1 mono text-[10px] text-gray-400">{v.podId.code}</span>
                      )}
                    </div>
                  </td>

                  {/* ETD / ETA */}
                  <DateCell value={v.etd} />
                  <DateCell value={v.eta} />

                  {/* ETP (conditional column) */}
                  {hasAnyEtp && <DateCell value={v.etp} />}

                  {/* ATD / ATA */}
                  <DateCell value={v.atd} actual />
                  <DateCell value={v.ata} actual />

                  {/* Status */}
                  <td className="px-3 py-2"><Badge label={v.status} /></td>

                  {/* Actions */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      {can('voyages', 'update') && (
                        <button
                          onClick={() => setEditTarget(v)}
                          className="text-xs font-medium text-teal-600 hover:text-teal-800 transition"
                        >
                          Edit
                        </button>
                      )}
                      {can('voyages', 'delete') && (
                        <button
                          onClick={() => setDeleteTarget(v)}
                          className="text-xs font-medium text-red-400 hover:text-red-600 transition"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Voyage Modal ─────────────────────────────────────────────── */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Voyage"
        size="lg"
      >
        {addOpen && (
          <VoyageAddForm
            round={round}
            onSuccess={() => {
              setAddOpen(false);
              qc.invalidateQueries(['round-voyages', roundId]);
              qc.invalidateQueries(['round', roundId]);
            }}
            onCancel={() => setAddOpen(false)}
          />
        )}
      </Modal>

      {/* ── Edit Voyage Modal ────────────────────────────────────────────── */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit Voyage — ${editTarget?.voyageNumber || ''}`}
        size="md"
      >
        {editTarget && (
          <VoyageEditForm
            voyage={editTarget}
            onSuccess={() => {
              setEditTarget(null);
              qc.invalidateQueries(['round-voyages', roundId]);
              qc.invalidateQueries(['voyages']);
            }}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </Modal>

      {/* ── Delete Confirm ───────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
        title="Delete Voyage"
        message={`Delete voyage "${deleteTarget?.voyageNumber}"? This cannot be undone. Voyages with active bookings cannot be deleted.`}
      />
    </>
  );
}
