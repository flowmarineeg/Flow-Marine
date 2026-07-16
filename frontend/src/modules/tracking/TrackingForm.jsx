'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { trackingService }  from '@/services/tracking.service';
import { servicesService }  from '@/services/services.service';
import { roundsService }    from '@/services/rounds.service';
import { voyagesService }   from '@/services/voyages.service';
import { vesselsService }   from '@/services/vessels.service';
import LocationSelect       from '@/components/forms/LocationSelect';
import { TRACKING_STATUS }  from '@/utils/constants';

const ic = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ec = 'mt-1 text-[11px] text-red-500';

// Default lastUpdate = now rounded to nearest minute
const nowLocal = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
};

export default function TrackingForm({ onEntryAdded }) {
  const qc = useQueryClient();

  // Cascade state (not in RHF — drives dependent queries)
  const [serviceId,  setServiceId]  = useState('');
  const [roundId,    setRoundId]    = useState('');
  const [voyageId,   setVoyageId]   = useState('');
  const [vesselId,   setVesselId]   = useState('');
  const [location,   setLocation]   = useState({ countryId: '', cityId: '', portId: '', terminalId: '' });

  const { register, handleSubmit, reset, setValue,
          formState: { errors } } = useForm({
    defaultValues: { status: 'At Port', lastUpdate: nowLocal(), remarks: '' },
  });

  // ── Dropdowns ───────────────────────────────────────────────────────────────
  const { data: svcData } = useQuery({
    queryKey: ['services-active-dropdown'],
    queryFn:  () => servicesService.listActive().then(r => r.data.data),
  });
  const services = svcData || [];

  const { data: roundData } = useQuery({
    queryKey: ['rounds-by-service', serviceId],
    queryFn:  () => roundsService.list({ serviceId, limit: 100 }).then(r => r.data.data),
    enabled:  !!serviceId,
  });
  const rounds = roundData || [];

  const { data: voyageData } = useQuery({
    queryKey: ['voyages-by-round', roundId],
    queryFn:  () => roundsService.getVoyages(roundId).then(r => r.data.data),
    enabled:  !!roundId,
  });
  const voyages = voyageData || [];

  // Auto-fill vessel when round changes
  useEffect(() => {
    if (!roundId) { setVesselId(''); return; }
    const round = rounds.find(r => r._id === roundId);
    if (round?.vesselId?._id || round?.vesselId) {
      setVesselId(round.vesselId?._id || round.vesselId);
    }
  }, [roundId, rounds]);

  // Reset downstream when service changes
  const handleServiceChange = (id) => {
    setServiceId(id);
    setRoundId('');
    setVoyageId('');
    setVesselId('');
  };

  // Reset downstream when round changes
  const handleRoundChange = (id) => {
    setRoundId(id);
    setVoyageId('');
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (payload) => trackingService.addEntry(payload),
    onSuccess: (res) => {
      toast.success('Tracking entry recorded');
      qc.invalidateQueries(['tracking-history', voyageId]);
      onEntryAdded?.(voyageId);
      // Reset form — keep service/round/voyage selection for quick re-entry
      reset({ status: 'At Port', lastUpdate: nowLocal(), remarks: '' });
      setLocation({ countryId: '', cityId: '', portId: '', terminalId: '' });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Save failed'),
  });

  const onSubmit = (data) => {
    if (!serviceId)          return toast.error('Select a service');
    if (!roundId)            return toast.error('Select a round');
    if (!voyageId)           return toast.error('Select a voyage');
    if (!vesselId)           return toast.error('Vessel not resolved — check round assignment');
    if (!location.portId)    return toast.error('Port is required');

    mutation.mutate({
      serviceId,
      roundId,
      voyageId,
      vesselId,
      countryId:  location.countryId  || null,
      cityId:     location.cityId     || null,
      portId:     location.portId,
      terminalId: location.terminalId || null,
      status:     data.status,
      lastUpdate: data.lastUpdate,
      remarks:    data.remarks || null,
    });
  };

  // Selected items for info strip
  const selectedVoyage = voyages.find(v => v._id === voyageId);
  const selectedRound  = rounds.find(r => r._id === roundId);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

      {/* ── Step 1: Cascade selection ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Select Context</p>

        {/* Service */}
        <div>
          <label className={lc}>Service <span className="text-red-400">*</span></label>
          <select
            value={serviceId}
            onChange={e => handleServiceChange(e.target.value)}
            className={`${ic(false)} cursor-pointer`}
          >
            <option value="">Select service…</option>
            {services.map(s => (
              <option key={s._id} value={s._id}>{s.serviceCode} — {s.serviceName}</option>
            ))}
          </select>
        </div>

        {/* Round (filtered by service) */}
        <div>
          <label className={lc}>Round <span className="text-red-400">*</span></label>
          <select
            value={roundId}
            onChange={e => handleRoundChange(e.target.value)}
            disabled={!serviceId}
            className={`${ic(false)} cursor-pointer disabled:opacity-50`}
          >
            <option value="">Select round…</option>
            {rounds.map(r => (
              <option key={r._id} value={r._id}>
                {r.roundNumber} — {r.status}
              </option>
            ))}
          </select>
        </div>

        {/* Voyage (filtered by round) */}
        <div>
          <label className={lc}>Voyage <span className="text-red-400">*</span></label>
          <select
            value={voyageId}
            onChange={e => setVoyageId(e.target.value)}
            disabled={!roundId}
            className={`${ic(false)} cursor-pointer disabled:opacity-50`}
          >
            <option value="">Select voyage…</option>
            {voyages.map(v => (
              <option key={v._id} value={v._id}>
                {v.voyageNumber} — {v.polId?.name ?? '?'} → {v.podId?.name ?? '?'}
              </option>
            ))}
          </select>
        </div>

        {/* Context info strip */}
        {selectedVoyage && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[
              { label: 'Voyage',  val: <span className="mono font-bold text-teal-600">{selectedVoyage.voyageNumber}</span> },
              { label: 'Status',  val: selectedVoyage.status },
              { label: 'Vessel',  val: vesselId
                  ? <span className="mono text-xs font-semibold text-gray-600">{selectedRound?.vesselId?.vesselCode || 'Assigned'}</span>
                  : <span className="text-amber-500 text-xs">Not resolved</span> },
              { label: 'Round',   val: <span className="mono text-xs text-gray-600">{selectedRound?.roundNumber}</span> },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-[13px] font-medium text-gray-700">{val}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Step 2: Current position ───────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Current Position</p>
        <LocationSelect
          value={location}
          onChange={setLocation}
          showTerminal
          required
          disabled={!voyageId}
        />
        {!voyageId && (
          <p className="text-xs text-gray-400 italic">Select a voyage above to enable port selection.</p>
        )}
      </div>

      {/* ── Step 3: Status & datetime ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Status & Timestamp</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lc}>Vessel Status <span className="text-red-400">*</span></label>
            <select {...register('status', { required: 'Status is required' })} className={`${ic(errors.status)} cursor-pointer`}>
              {TRACKING_STATUS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {errors.status && <p className={ec}>{errors.status.message}</p>}
          </div>

          <div>
            <label className={lc}>Last Update <span className="text-red-400">*</span></label>
            <input
              type="datetime-local"
              max={nowLocal()}
              {...register('lastUpdate', { required: 'Last update time is required' })}
              className={ic(errors.lastUpdate)}
            />
            {errors.lastUpdate && <p className={ec}>{errors.lastUpdate.message}</p>}
          </div>
        </div>

        <div>
          <label className={lc}>Remarks</label>
          <textarea
            {...register('remarks')}
            rows={3}
            placeholder="Any additional notes about the vessel position or status…"
            className={`${ic(false)} resize-none`}
          />
        </div>
      </div>

      {/* ── Submit ────────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="btn btn-primary btn-md w-full flex items-center justify-center gap-2"
      >
        {mutation.isPending ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Recording…
          </>
        ) : (
          <>
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/>
              <circle cx="12" cy="11" r="3" fill="currentColor" stroke="none"/>
            </svg>
            Record Position Update
          </>
        )}
      </button>
    </form>
  );
}
