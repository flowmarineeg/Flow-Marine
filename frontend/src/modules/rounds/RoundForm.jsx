'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { roundsService } from '@/services/rounds.service';
import { servicesService } from '@/services/services.service';
import { vesselsService } from '@/services/vessels.service';
import { ROUND_STATUS } from '@/utils/constants';

export default function RoundForm({ item, onSuccess, onCancel }) {
  const qc        = useQueryClient();
  const isEditing = !!item;

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      serviceId: item?.serviceId?._id || item?.serviceId || '',
      vesselId:  item?.vesselId?._id  || item?.vesselId  || '',
      startDate: item?.startDate ? item.startDate.slice(0, 10) : '',
      endDate:   item?.endDate   ? item.endDate.slice(0, 10)   : '',
      status:    item?.status    || 'Planned',
      notes:     item?.notes     || '',
    },
  });

  const watchedServiceId = watch('serviceId');

  // Active services dropdown
  const { data: servicesData } = useQuery({
    queryKey: ['services-active-dropdown'],
    queryFn:  () => servicesService.listActive().then(r => r.data.data),
  });
  const services = servicesData || [];

  // Active vessels dropdown
  const { data: vesselData } = useQuery({
    queryKey: ['vessels-active-dropdown'],
    queryFn:  () => vesselsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
  });
  const vessels = vesselData || [];

  // When service changes (create mode), auto-fill default vessel
  useEffect(() => {
    if (isEditing) return;
    if (!watchedServiceId) return;
    const svc = services.find(s => s._id === watchedServiceId);
    if (svc?.defaultVesselId) {
      setValue('vesselId', svc.defaultVesselId._id || svc.defaultVesselId);
    }
  }, [watchedServiceId, services, isEditing, setValue]);

  const mutation = useMutation({
    mutationFn: (data) =>
      isEditing
        ? roundsService.update(item._id, data)
        : roundsService.create(data),
    onSuccess: (res) => {
      toast.success(isEditing ? 'Round updated' : 'Round created — voyages generated!');
      qc.invalidateQueries(['rounds']);
      onSuccess?.(res.data.data);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Save failed'),
  });

  const inputCls  = (err) => `w-full text-[13.5px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition ${err ? 'border-red-400 focus:ring-red-500/10' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
  const labelCls  = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
  const errCls    = 'mt-1 text-xs text-red-500';

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-5">

      {/* Service */}
      <div>
        <label className={labelCls}>Service <span className="text-red-400">*</span></label>
        <select
          {...register('serviceId', { required: 'Service is required' })}
          disabled={isEditing}
          className={`${inputCls(errors.serviceId)} ${isEditing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <option value="">Select service…</option>
          {services.map(s => (
            <option key={s._id} value={s._id}>{s.serviceCode} — {s.serviceName}</option>
          ))}
        </select>
        {errors.serviceId && <p className={errCls}>{errors.serviceId.message}</p>}
        {isEditing && (
          <p className="mt-1 text-[11px] text-amber-500">Service cannot be changed on an existing round</p>
        )}
      </div>

      {/* Vessel */}
      <div>
        <label className={labelCls}>Vessel <span className="text-red-400">*</span></label>
        <select
          {...register('vesselId', { required: 'Vessel is required' })}
          className={`${inputCls(errors.vesselId)} cursor-pointer`}
        >
          <option value="">Select vessel…</option>
          {vessels.map(v => (
            <option key={v._id} value={v._id}>{v.vesselCode} — {v.vesselName}</option>
          ))}
        </select>
        {errors.vesselId && <p className={errCls}>{errors.vesselId.message}</p>}
      </div>

      {/* Dates row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Start Date <span className="text-red-400">*</span></label>
          <input
            type="date"
            {...register('startDate', { required: 'Start date is required' })}
            className={inputCls(errors.startDate)}
          />
          {errors.startDate && <p className={errCls}>{errors.startDate.message}</p>}
        </div>
        <div>
          <label className={labelCls}>End Date <span className="text-red-400">*</span></label>
          <input
            type="date"
            {...register('endDate', { required: 'End date is required' })}
            className={inputCls(errors.endDate)}
          />
          {errors.endDate && <p className={errCls}>{errors.endDate.message}</p>}
        </div>
      </div>

      {/* Status */}
      <div>
        <label className={labelCls}>Status</label>
        <select {...register('status')} className={`${inputCls(false)} cursor-pointer`}>
          {ROUND_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          {...register('notes')}
          rows={3}
          placeholder="Optional operational notes…"
          className={`${inputCls(false)} resize-none`}
        />
      </div>

      {/* Voyage generation notice (create only) */}
      {!isEditing && (
        <div className="flex items-start gap-2.5 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p className="text-[12.5px] text-teal-700 leading-relaxed">
            Saving will automatically generate voyages from the service's route legs — one voyage per consecutive port pair.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-md">
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn btn-primary btn-md flex items-center gap-1.5"
        >
          {mutation.isPending ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              {isEditing ? 'Saving…' : 'Creating & Generating…'}
            </>
          ) : isEditing ? 'Save Changes' : 'Create Round'}
        </button>
      </div>
    </form>
  );
}
