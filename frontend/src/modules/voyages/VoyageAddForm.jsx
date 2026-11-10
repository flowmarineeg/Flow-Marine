'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { voyagesService } from '@/services/voyages.service';
import { VOYAGE_DIRECTION } from '@/utils/constants';

const lc  = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ic  = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const ec  = 'mt-1 text-[11px] text-red-500';
const LETTER = { East: 'E', West: 'W', North: 'N', South: 'S' };

// A voyage is one run over a range of the round's legs, e.g. East from leg 1 to leg 4 (or back, 4 to 1).
export default function VoyageAddForm({ round, onSuccess, onCancel }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      direction: 'East', fromLegKey: '', toLegKey: '', voyageCode: '', voyageName: '',
      etd: '', eta: '', etp: '',
    },
  });
  const [callDates, setCallDates] = useState({});   // legKey -> { eta, etd }

  const { data: legs = [], isLoading: legsLoading } = useQuery({
    queryKey: ['round-route-ports', round._id],
    queryFn:  () => voyagesService.getRoundRoutePorts(round._id).then(r => r.data.data),
    staleTime: 60 * 1000,
  });

  const direction = watch('direction');
  const fromKey   = watch('fromLegKey');
  const toKey     = watch('toLegKey');

  // Ports the run calls at, in travel order (same rule as the server)
  const calls = useMemo(() => {
    const sorted = [...legs].sort((a, b) => a.sequence - b.sequence);
    const i = sorted.findIndex(l => l.legKey === fromKey);
    const j = sorted.findIndex(l => l.legKey === toKey);
    if (i < 0 || j < 0 || i === j) return [];
    const step = i < j ? 1 : -1;
    const out = [];
    for (let k = i; k !== j + step; k += step) out.push(sorted[k]);
    return out;
  }, [legs, fromKey, toKey]);

  const setDate = (legKey, field, value) =>
    setCallDates(prev => ({ ...prev, [legKey]: { ...prev[legKey], [field]: value } }));

  const mutation = useMutation({
    mutationFn: (data) => voyagesService.create({
      roundId:     round._id,
      direction:   data.direction,
      fromLegKey:  data.fromLegKey,
      toLegKey:    data.toLegKey,
      voyageCode:  data.voyageCode || null,
      voyageName:  data.voyageName,
      etd:         data.etd || null,
      eta:         data.eta || null,
      etp:         data.etp || null,
      portCalls:   calls
        .filter(c => callDates[c.legKey]?.eta || callDates[c.legKey]?.etd)
        .map(c => ({ legKey: c.legKey, eta: callDates[c.legKey].eta || null, etd: callDates[c.legKey].etd || null })),
    }),
    onSuccess: (res) => {
      toast.success(`Voyage ${res?.data?.data?.voyageNumber || ''} added`);
      (res?.data?.data?.warnings || []).forEach(w => toast(w, { icon: '⚠️', duration: 6000 }));
      onSuccess?.();
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  const legOption = (l) => (
    <option key={l.legKey} value={l.legKey}>Leg {l.sequence} — {l.name}{l.code ? ` (${l.code})` : ''}</option>
  );
  const sameLeg = fromKey && fromKey === toKey;

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col gap-4">

      {/* Round info strip */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Round</p>
            <p className="mono font-bold text-teal-700">{round.roundNumber} <span className="font-normal text-teal-600">({round.roundName || '(unnamed)'})</span></p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Service</p>
            <p className="text-gray-700 font-medium">{round.serviceId?.serviceCode}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Vessel</p>
            <p className="text-gray-700 font-medium">{round.vesselId?.vesselCode}</p>
          </div>
        </div>
      </div>

      {/* Direction + legs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={lc}>Direction <span className="text-red-400">*</span></label>
          <select {...register('direction', { required: true })} className={`${ic(false)} cursor-pointer`}>
            {VOYAGE_DIRECTION.map(d => <option key={d} value={d}>{d}bound ({LETTER[d]})</option>)}
          </select>
        </div>
        <div>
          <label className={lc}>From leg <span className="text-red-400">*</span></label>
          {legsLoading ? <div className={`${ic(false)} text-gray-400`}>Loading legs…</div> : (
            <select {...register('fromLegKey', { required: 'Start leg is required' })} className={`${ic(errors.fromLegKey)} cursor-pointer`}>
              <option value="">Select start leg…</option>
              {legs.map(legOption)}
            </select>
          )}
          {errors.fromLegKey && <p className={ec}>{errors.fromLegKey.message}</p>}
        </div>
        <div>
          <label className={lc}>To leg <span className="text-red-400">*</span></label>
          {legsLoading ? <div className={`${ic(false)} text-gray-400`}>Loading legs…</div> : (
            <select {...register('toLegKey', { required: 'End leg is required' })} className={`${ic(errors.toLegKey || sameLeg)} cursor-pointer`}>
              <option value="">Select end leg…</option>
              {legs.map(legOption)}
            </select>
          )}
          {errors.toLegKey && <p className={ec}>{errors.toLegKey.message}</p>}
          {sameLeg && <p className={ec}>Start and end leg must be different</p>}
        </div>
      </div>
      {legs.length === 0 && !legsLoading && <p className={ec}>This round has no legs.</p>}

      <p className="text-[12px] text-gray-500 -mt-2">
        The voyage number is assigned when you save: <span className="mono font-semibold">V</span> + the next running number + <span className="mono font-semibold">{LETTER[direction] || '?'}</span> (for example <span className="mono font-semibold">V0001{LETTER[direction] || 'E'}</span>).
      </p>

      {/* Port calls preview + per-port dates */}
      {calls.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Port calls — {calls.length} ports, {calls[0].name} → {calls[calls.length - 1].name}
          </div>
          <div className="divide-y divide-gray-100">
            {calls.map((c, i) => (
              <div key={`${c.legKey}-${i}`} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr] gap-2 items-center px-4 py-2">
                <div className="text-sm text-gray-700">
                  <span className="text-[10px] font-bold text-teal-700 mr-1.5">Leg {c.sequence}</span>{c.name}
                </div>
                <input type="datetime-local" aria-label={`ETA ${c.name}`} disabled={i === 0}
                  value={callDates[c.legKey]?.eta || ''} onChange={e => setDate(c.legKey, 'eta', e.target.value)}
                  className={`${ic(false)} disabled:bg-gray-50 disabled:text-gray-300`} title="ETA at this port" />
                <input type="datetime-local" aria-label={`ETD ${c.name}`} disabled={i === calls.length - 1}
                  value={callDates[c.legKey]?.etd || ''} onChange={e => setDate(c.legKey, 'etd', e.target.value)}
                  className={`${ic(false)} disabled:bg-gray-50 disabled:text-gray-300`} title="ETD from this port" />
              </div>
            ))}
          </div>
          <p className="px-4 py-1.5 text-[11px] text-gray-400 bg-gray-50">Optional. Left column = arrival (ETA), right = departure (ETD).</p>
        </div>
      )}

      {/* Voyage Name + Code */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lc}>Voyage Name <span className="text-red-400">*</span></label>
          <input {...register('voyageName', { required: 'Voyage Name is required' })} placeholder="e.g. Asia to Middle East" className={ic(errors.voyageName)} />
          {errors.voyageName && <p className={ec}>{errors.voyageName.message}</p>}
        </div>
        <div>
          <label className={lc}>Voyage Code</label>
          <input {...register('voyageCode')} placeholder="optional" className={ic(false)} />
        </div>
      </div>

      {/* ETD / ETA / ETP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={lc}>ETD <span className="text-gray-300 font-normal normal-case text-[10px]">first port</span></label>
          <input type="datetime-local" {...register('etd')} className={ic(false)} />
        </div>
        <div>
          <label className={lc}>ETA <span className="text-gray-300 font-normal normal-case text-[10px]">last port</span></label>
          <input type="datetime-local" {...register('eta')} className={ic(false)} />
        </div>
        <div>
          <label className={lc}>ETP</label>
          <input type="datetime-local" {...register('etp')} className={ic(false)} />
        </div>
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">New voyages start as <b>Scheduled</b>. Departure and arrival are recorded later by editing the voyage.</p>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-md">Cancel</button>
        <button type="submit" disabled={mutation.isPending || legsLoading || sameLeg} className="btn btn-primary btn-md flex items-center gap-1.5">
          {mutation.isPending ? 'Adding…' : 'Add Voyage'}
        </button>
      </div>
    </form>
  );
}
