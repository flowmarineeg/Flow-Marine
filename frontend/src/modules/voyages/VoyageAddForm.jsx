'use client';

import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { voyagesService } from '@/services/voyages.service';
import { VOYAGE_STATUS } from '@/utils/constants';

const lc  = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ic  = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const ec  = 'mt-1 text-[11px] text-red-500';

export default function VoyageAddForm({ round, onSuccess, onCancel }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      polId: '', podId: '', voyageCode: '', status: 'Scheduled',
      etd: '', eta: '', etp: '', atd: '', ata: '',
    },
  });

  const selectedPol = watch('polId');

  // Load route ports for this round's service
  const { data: routePorts = [], isLoading: portsLoading } = useQuery({
    queryKey: ['round-route-ports', round._id],
    queryFn:  () => voyagesService.getRoundRoutePorts(round._id).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  const polOptions = routePorts;
  const podOptions = routePorts.filter(p => String(p.portId) !== String(selectedPol));

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        roundId:     round._id,
        polId:       data.polId,
        podId:       data.podId,
        voyageCode:  data.voyageCode || null,
        status:      data.status,
        etd:         data.etd  || null,
        eta:         data.eta  || null,
        etp:         data.etp  || null,
        atd:         data.atd  || null,
        ata:         data.ata  || null,
      };
      return voyagesService.create(payload);
    },
    onSuccess: () => {
      toast.success('Voyage added');
      onSuccess?.();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to add voyage'),
  });

  const sc = `${ic(false)} cursor-pointer`;

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col gap-4">

      {/* Round info strip */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Round</p>
            <p className="mono font-bold text-teal-700">{round.roundNumber}</p>
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

      {/* POL / POD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lc}>
            Port of Loading (POL) <span className="text-red-400">*</span>
          </label>
          {portsLoading ? (
            <div className={`${ic(false)} text-gray-400`}>Loading ports…</div>
          ) : (
            <select {...register('polId', { required: 'POL is required' })} className={`${ic(errors.polId)} cursor-pointer`}>
              <option value="">Select POL…</option>
              {polOptions.map(p => (
                <option key={String(p.portId)} value={String(p.portId)}>
                  Leg {p.sequence} — {p.name}{p.code ? ` (${p.code})` : ''}
                </option>
              ))}
            </select>
          )}
          {errors.polId && <p className={ec}>{errors.polId.message}</p>}
        </div>

        <div>
          <label className={lc}>
            Port of Discharge (POD) <span className="text-red-400">*</span>
          </label>
          {portsLoading ? (
            <div className={`${ic(false)} text-gray-400`}>Loading ports…</div>
          ) : (
            <select {...register('podId', { required: 'POD is required' })} className={`${ic(errors.podId)} cursor-pointer`}>
              <option value="">Select POD…</option>
              {podOptions.map(p => (
                <option key={String(p.portId)} value={String(p.portId)}>
                  Leg {p.sequence} — {p.name}{p.code ? ` (${p.code})` : ''}
                </option>
              ))}
            </select>
          )}
          {errors.podId && <p className={ec}>{errors.podId.message}</p>}
          {routePorts.length === 0 && !portsLoading && (
            <p className={ec}>No route ports found — add route legs to this service first.</p>
          )}
        </div>
      </div>

      {/* Voyage Code + Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lc}>
            Voyage Code
            <span className="ml-1.5 text-gray-300 font-normal normal-case text-[10px]">(optional)</span>
          </label>
          <input
            {...register('voyageCode')}
            placeholder="e.g. V2025-001, SHUTTLE-MAR"
            className={ic(false)}
          />
        </div>
        <div>
          <label className={lc}>Status</label>
          <select {...register('status')} className={sc}>
            {VOYAGE_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* ETD / ETA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lc}>ETD <span className="text-gray-300 font-normal normal-case text-[10px]">Estimated Departure</span></label>
          <input type="datetime-local" {...register('etd')} className={ic(false)} />
        </div>
        <div>
          <label className={lc}>ETA <span className="text-gray-300 font-normal normal-case text-[10px]">Estimated Arrival</span></label>
          <input type="datetime-local" {...register('eta')} className={ic(false)} />
        </div>
      </div>

      {/* ETP */}
      <div>
        <label className={lc}>ETP <span className="text-gray-300 font-normal normal-case text-[10px]">Estimated Time of Port</span></label>
        <input type="datetime-local" {...register('etp')} className={ic(false)} />
      </div>

      {/* ATD / ATA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lc}>ATD <span className="text-gray-300 font-normal normal-case text-[10px]">Actual Departure</span></label>
          <input type="datetime-local" {...register('atd')} className={ic(false)} />
        </div>
        <div>
          <label className={lc}>ATA <span className="text-gray-300 font-normal normal-case text-[10px]">Actual Arrival</span></label>
          <input type="datetime-local" {...register('ata')} className={ic(false)} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-md">Cancel</button>
        <button
          type="submit"
          disabled={mutation.isPending || portsLoading}
          className="btn btn-primary btn-md flex items-center gap-1.5"
        >
          {mutation.isPending ? (
            <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>Adding…</>
          ) : (
            <><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" d="M12 5v14M5 12h14"/>
            </svg>Add Voyage</>
          )}
        </button>
      </div>
    </form>
  );
}
