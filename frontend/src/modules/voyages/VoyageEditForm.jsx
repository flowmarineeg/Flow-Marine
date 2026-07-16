'use client';

import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { voyagesService } from '@/services/voyages.service';
import { VOYAGE_STATUS } from '@/utils/constants';

// Valid next status transitions (mirrors backend)
const TRANSITIONS = {
  Scheduled:    ['Departed', 'Cancelled'],
  Departed:     ['In Transit', 'Arrived', 'Cancelled'],
  'In Transit': ['Arrived', 'Cancelled'],
  Arrived:      ['Completed'],
  Completed:    [],
  Cancelled:    [],
};

const toInputDate = (d) => d ? new Date(d).toISOString().slice(0, 16) : '';

const lc  = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ic  = (err) =>
  `w-full text-[13.5px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-500/10' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;

export default function VoyageEditForm({ voyage, onSuccess, onCancel }) {
  const allowedStatuses = [voyage.status, ...(TRANSITIONS[voyage.status] || [])];

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      etd:        toInputDate(voyage.etd),
      eta:        toInputDate(voyage.eta),
      etp:        toInputDate(voyage.etp),
      atd:        toInputDate(voyage.atd),
      ata:        toInputDate(voyage.ata),
      status:     voyage.status,
      voyageCode: voyage.voyageCode || '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data) => voyagesService.update(voyage._id, data),
    onSuccess:  () => { toast.success('Voyage updated'); onSuccess?.(); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Update failed'),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col gap-5">

      {/* Read-only voyage info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Voyage No</p>
            <p className="mono font-bold text-gray-700">{voyage.voyageNumber}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Round</p>
            <p className="mono font-semibold text-teal-600">{voyage.roundId?.roundNumber || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Port of Loading</p>
            <p className="font-medium text-gray-700">
              {voyage.polId?.name}
              {voyage.polId?.code && <span className="text-gray-400 text-xs mono ml-1">{voyage.polId.code}</span>}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Port of Discharge</p>
            <p className="font-medium text-gray-700">
              {voyage.podId?.name}
              {voyage.podId?.code && <span className="text-gray-400 text-xs mono ml-1">{voyage.podId.code}</span>}
            </p>
          </div>
        </div>
        {/* Type badge */}
        <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            voyage.isManual
              ? 'bg-purple-100 text-purple-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {voyage.isManual ? 'Manual Voyage' : 'Auto-generated'}
          </span>
          <span className="text-[11px] text-gray-400">Sequence #{voyage.sequence}</span>
        </div>
      </div>

      {/* Status */}
      <div>
        <label className={lc}>Status</label>
        <select {...register('status')} className={`${ic(false)} cursor-pointer`}>
          {allowedStatuses.map(s => (
            <option key={s} value={s}>{s}{s === voyage.status ? ' (current)' : ''}</option>
          ))}
        </select>
        {allowedStatuses.length <= 1 && (
          <p className="mt-1 text-[11px] text-amber-500">No further status transitions available</p>
        )}
      </div>

      {/* Voyage Code */}
      <div>
        <label className={lc}>
          Voyage Code
          <span className="ml-1.5 text-gray-300 font-normal normal-case text-[10px]">(optional)</span>
        </label>
        <input
          {...register('voyageCode')}
          placeholder="e.g. V2025-001"
          className={ic(false)}
        />
      </div>

      {/* ETD / ETA */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lc}>ETD <span className="text-gray-300 font-normal normal-case text-[10px]">Estimated Departure</span></label>
          <input type="datetime-local" {...register('etd')} className={ic(false)} />
        </div>
        <div>
          <label className={lc}>ETA <span className="text-gray-300 font-normal normal-case text-[10px]">Estimated Arrival</span></label>
          <input type="datetime-local" {...register('eta')} className={ic(false)} />
        </div>
      </div>

      {/* ETP — full width */}
      <div>
        <label className={lc}>
          ETP
          <span className="ml-1.5 text-gray-300 font-normal normal-case text-[10px]">Estimated Time of Port</span>
        </label>
        <input type="datetime-local" {...register('etp')} className={ic(false)} />
      </div>

      {/* ATD / ATA */}
      <div className="grid grid-cols-2 gap-3">
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
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-md">Cancel</button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn btn-primary btn-md flex items-center gap-1.5"
        >
          {mutation.isPending ? (
            <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>Saving…</>
          ) : (
            <><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
            </svg>Save Voyage</>
          )}
        </button>
      </div>
    </form>
  );
}
