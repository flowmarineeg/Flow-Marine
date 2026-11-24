'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { getVoyageLabel } from '@/utils/voyageLabel';
import { voyagesService } from '@/services/voyages.service';
import { useVoyageVesselDetail } from '@/hooks/useVoyageVessels';
import { usePermission } from '@/context/PermissionContext';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import LoadBadge from '@/components/ui/LoadBadge';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FormPage from '@/components/ui/FormPage';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import VoyageEditForm from '@/modules/voyages/VoyageEditForm';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function Stat({ label, children }) {
  return (
    <div className="card px-4 py-3 min-w-[140px]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <div className="text-base font-bold text-gray-800 mt-0.5">{children}</div>
    </div>
  );
}

/**
 * Voyages page, level 2: one vessel's open rounds (Planned / Active) and their open voyages, with the capacity
 * numbers of each (capacity engine). Click a voyage to open its details page.
 */
export default function VoyageVesselDetail({ vesselId }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = usePermission();
  const q = useVoyageVesselDetail(vesselId);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loadingEditId, setLoadingEditId] = useState(null);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['voyage-vessel'] }); qc.invalidateQueries({ queryKey: ['voyage-vessels'] }); qc.invalidateQueries({ queryKey: ['voyages'] }); };

  const deleteMutation = useMutation({
    mutationFn: (id) => voyagesService.remove(id),
    onSuccess: () => { toast.success('Voyage deleted'); setDeleteTarget(null); refresh(); },
    onError: (e) => { showErrorToast(e, 'delete'); setDeleteTarget(null); },
  });

  // The edit form needs the full voyage document (port calls, populated round and ports): load it from the round's list.
  const openEdit = async (roundId, v) => {
    setLoadingEditId(v._id);
    try {
      const r = await voyagesService.list({ roundId, limit: 200 });
      const full = (r.data?.data || []).find((x) => x._id === v._id);
      if (full) setEditTarget(full); else toast.error('Voyage not found');
    } catch (e) { showErrorToast(e, 'load'); } finally { setLoadingEditId(null); }
  };

  const crumb = (
    <div className="flex flex-wrap items-center gap-2 mb-3 text-[13px]">
      <button type="button" onClick={() => router.push('/voyages')} className="font-semibold text-teal-600 hover:text-teal-800 transition">← Vessels</button>
      {q.data && <><span className="text-gray-300">/</span><span className="font-semibold text-gray-800">{q.data.vessel.vesselName}</span><span className="mono text-[11px] text-gray-400">{q.data.vessel.vesselCode}</span></>}
    </div>
  );

  if (q.isLoading) return <LoadingSpinner fullPage />;
  if (q.isError || !q.data) {
    const status = q.error?.response?.status;
    return (
      <div className="animate-fadeIn">
        {crumb}
        <EmptyState
          title={status === 404 || status === 400 ? 'Vessel not found' : 'Could not load the vessel'}
          message={status === 404 || status === 400 ? 'This vessel does not exist.' : (q.error?.response?.data?.message || q.error?.message)}
        />
      </div>
    );
  }

  const { vessel, totals, rounds } = q.data;

  return (
    <div className="animate-fadeIn min-w-0 w-full">
      {crumb}
      <PageHeader title={vessel.vesselName} subtitle="Open rounds (Planned / Active) and their voyages that are not completed or cancelled" />

      <div className="flex flex-wrap gap-3 mb-5">
        <Stat label="Vessel TEU">{vessel.capacity != null ? vessel.capacity.toLocaleString() : '—'}</Stat>
        <Stat label="Booked TEU (all open voyages)">{totals.bookedTEU.toLocaleString()}</Stat>
        <Stat label="Peak load"><LoadBadge pct={totals.peakUtilisationPct} /></Stat>
        <Stat label="Open rounds / voyages">{totals.openRounds} / {totals.openVoyages}</Stat>
      </div>

      {!rounds.length ? (
        <div className="card overflow-hidden">
          <EmptyState title="No open rounds or voyages" message="This vessel has no Planned or Active round with an open voyage." />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {rounds.map((b) => (
            <div key={b.round._id} className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2 px-1">
                <button type="button" onClick={() => router.push(`/rounds/${b.round._id}`)} className="mono text-sm font-bold text-teal-700 hover:underline">{b.round.roundNumber}</button>
                <span className="text-xs text-gray-400">{b.round.roundName || '(unnamed)'}</span>
                <Badge label={b.round.status} />
                <span className="text-[11px] text-gray-400">· {fmt(b.round.startDate)} → {fmt(b.round.endDate)}</span>
                <span className="text-[11px] text-gray-400">· {b.voyages.length} voyage{b.voyages.length !== 1 ? 's' : ''} · {b.totals.bookedTEU.toLocaleString()} TEU booked</span>
                <LoadBadge pct={b.totals.peakUtilisationPct} />
              </div>

              <div className="card overflow-hidden min-w-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: 1000 }}>
                    <thead>
                      <tr className="table-header">
                        {['Voyage', 'POL', 'POD', 'ETD', 'ETA', 'ATD', 'ATA', 'Status', 'Booked TEU', 'Peak load', 'Actions'].map((h) => <th key={h}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {b.voyages.map((v) => (
                        <tr key={v._id} className="table-row cursor-pointer" onClick={() => router.push(`/voyages/${v._id}?from=${vessel._id}`)}>
                          <td>
                            <span className="mono text-xs font-bold text-gray-700">{getVoyageLabel(v)}</span>
                            {v.direction && <span className="ml-1.5 text-[10px] text-gray-400">{v.direction}</span>}
                          </td>
                          <td><span className="text-sm text-gray-700">{v.polId?.name}</span>{v.polId?.code && <span className="ml-1 mono text-[10px] text-gray-400">{v.polId.code}</span>}</td>
                          <td><span className="text-sm text-gray-700">{v.podId?.name}</span>{v.podId?.code && <span className="ml-1 mono text-[10px] text-gray-400">{v.podId.code}</span>}</td>
                          <td className={`text-xs ${v.etd ? 'text-gray-600' : 'text-gray-300'}`}>{fmt(v.etd)}</td>
                          <td className={`text-xs ${v.eta ? 'text-gray-600' : 'text-gray-300'}`}>{fmt(v.eta)}</td>
                          <td className={`text-xs ${v.atd ? 'text-blue-600 font-medium' : 'text-gray-300'}`}>{fmt(v.atd)}</td>
                          <td className={`text-xs ${v.ata ? 'text-blue-600 font-medium' : 'text-gray-300'}`}>{fmt(v.ata)}</td>
                          <td><Badge label={v.status} /></td>
                          <td><span className="mono text-xs text-gray-700">{v.loadedTEU.toLocaleString()}</span></td>
                          <td><LoadBadge pct={v.utilisationPct} title={v.remainingTEU != null ? `${v.remainingTEU} TEU free at the busiest leg` : undefined} /></td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-3">
                              {can('voyages', 'update') && (
                                <button onClick={() => openEdit(b.round._id, v)} disabled={loadingEditId === v._id} className="text-xs font-medium text-teal-600 hover:text-teal-800 transition disabled:opacity-50">
                                  {loadingEditId === v._id ? '…' : 'Edit'}
                                </button>
                              )}
                              {can('voyages', 'delete') && (
                                <button onClick={() => setDeleteTarget(v)} className="text-xs font-medium text-red-400 hover:text-red-600 transition">Delete</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormPage open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit Voyage — ${getVoyageLabel(editTarget) || ''}`} size="md">
        {editTarget && (
          <VoyageEditForm
            voyage={editTarget}
            onSuccess={() => { setEditTarget(null); refresh(); }}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </FormPage>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
        loading={deleteMutation.isPending}
        title="Delete Voyage"
        message={`Delete voyage "${getVoyageLabel(deleteTarget)}"? This cannot be undone. Voyages with active bookings cannot be deleted.`}
      />
    </div>
  );
}
