'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { roundsService } from '@/services/rounds.service';
import { agentsService } from '@/services/agents.service';
import { usePermission } from '@/context/PermissionContext';
import Modal from '@/components/ui/Modal';
import { LegRow, emptyLeg } from '@/modules/services/RouteEditor';

const idOf = (v) => (v && typeof v === 'object' ? v._id : v) || '';

// Round legs = the route legs copied into the round when it was created. Editable here without touching the
// Service route. Legs that voyages already use stay editable: the API saves and returns warnings.
export default function RoundLegsPanel({ round }) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const [open, setOpen] = useState(false);
  const [legs, setLegs] = useState([]);

  const snapshot = round.routeSnapshot?.legs || [];
  const editable = can('rounds', 'update') && !['Completed', 'Cancelled'].includes(round.status) && round.closeStatus !== 'Closed';

  const { data: agents = [] } = useQuery({
    queryKey: ['agents-active-dropdown'],
    queryFn:  () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
    enabled:  open,
  });

  const startEdit = () => {
    setLegs([...snapshot].sort((a, b) => a.sequence - b.sequence).map(l => ({
      _key:       l.legKey || Math.random().toString(36).slice(2),
      legKey:     l.legKey || undefined,
      countryId:  idOf(l.countryId),
      cityId:     idOf(l.cityId),
      portId:     idOf(l.portId),
      terminalId: idOf(l.terminalId),
      agentId:    idOf(l.agentId),
    })));
    setOpen(true);
  };

  const mutation = useMutation({
    mutationFn: (payload) => roundsService.updateLegs(round._id, payload),
    onSuccess: (res) => {
      toast.success('Round legs saved');
      (res?.data?.data?.warnings || []).forEach(w => toast(w, { icon: '⚠️', duration: 8000 }));
      setOpen(false);
      qc.invalidateQueries(['round', round._id]);
      qc.invalidateQueries(['round-route-ports', round._id]);
      qc.invalidateQueries(['round-voyages', round._id]);
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  const handleChange = useCallback((idx, updated) => setLegs(prev => prev.map((l, i) => (i === idx ? updated : l))), []);
  const handleRemove = (idx) => setLegs(prev => prev.filter((_, i) => i !== idx));
  const handleAdd    = () => setLegs(prev => [...prev, emptyLeg()]);

  const save = () => {
    for (let i = 0; i < legs.length; i++) {
      if (!legs[i].countryId || !legs[i].cityId || !legs[i].portId) {
        toast.error(`Leg ${i + 1}: country, city and port are required`);
        return;
      }
    }
    if (legs.length < 2) { toast.error('A round needs at least 2 legs'); return; }
    mutation.mutate(legs.map(l => ({
      legKey:     l.legKey,
      countryId:  l.countryId,
      cityId:     l.cityId,
      portId:     l.portId,
      terminalId: l.terminalId || null,
      agentId:    l.agentId    || null,
    })));
  };

  if (snapshot.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Round legs <span className="normal-case font-normal text-gray-300">— copied from the route, editable here</span>
        </p>
        {editable && (
          <button onClick={startEdit} className="text-xs font-medium text-teal-600 hover:text-teal-800 transition">Edit legs</button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600">
        {[...snapshot].sort((a, b) => a.sequence - b.sequence).map((l, i, arr) => (
          <span key={l.legKey || i} className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5">
              <span className="text-[10px] font-bold text-teal-700">{l.sequence}</span>
              <span>{l.portName || l.portCode || '—'}</span>
            </span>
            {i < arr.length - 1 && <span className="text-gray-300">→</span>}
          </span>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Edit legs — ${round.roundNumber}`} size="xl">
        {open && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-500">
              Changing a leg does not change the Service route. Voyages keep the ports they were created with; if a voyage no longer matches
              you get a warning and can use <b>Refresh ports</b> on that voyage.
            </p>
            <div className="flex flex-col gap-3">
              {legs.map((leg, idx) => (
                <LegRow key={leg._key} leg={leg} index={idx} total={legs.length} onChange={handleChange} onRemove={handleRemove} disabled={mutation.isPending} agents={agents} />
              ))}
            </div>
            <button type="button" onClick={handleAdd} disabled={mutation.isPending}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-2.5 text-sm text-gray-400 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-all disabled:opacity-50">
              + Add leg
            </button>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary btn-md">Cancel</button>
              <button type="button" onClick={save} disabled={mutation.isPending || legs.length < 2} className="btn btn-primary btn-md">
                {mutation.isPending ? 'Saving…' : 'Save legs'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
