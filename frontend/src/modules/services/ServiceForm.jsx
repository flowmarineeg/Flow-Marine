'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { servicesService } from '@/services/services.service';
import { vesselsService } from '@/services/vessels.service';
import { accountsService } from '@/services/accounts.service';
import { SERVICE_STATUS, SERVICE_APPLICABILITY } from '@/utils/constants';

export default function ServiceForm({ item, onSuccess, onCancel }) {
  const qc        = useQueryClient();
  const isEditing = !!item;

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      serviceCode:     item?.serviceCode     || '',
      serviceName:     item?.serviceName     || '',
      defaultVesselId: item?.defaultVesselId?._id || item?.defaultVesselId || '',
      description:     item?.description     || '',
      status:          item?.status          || 'Active',
      applicability:   item?.applicability   || 'SOC_ONLY',
      isTaxable:       item?.isTaxable ? 'true' : 'false',
      revenueAccountId: item?.revenueAccountId?._id || item?.revenueAccountId || '',
    },
  });

  const { data: revenueAccounts = [] } = useQuery({
    queryKey: ['accounts', 'revenue'],
    queryFn:  () => accountsService.lookup('revenue').then(r => r.data.data),
  });

  const { data: vesselData } = useQuery({
    queryKey: ['vessels-active-dropdown'],
    queryFn:  () => vesselsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
  });
  const vessels = vesselData || [];

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, isTaxable: data.isTaxable === 'true' };
      return isEditing ? servicesService.update(item._id, payload) : servicesService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Service updated' : 'Service created');
      qc.invalidateQueries(['services']);
      onSuccess?.();
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="flex flex-col gap-4">

      {/* Service Code */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Service Code <span className="text-red-400">*</span>
        </label>
        <input
          {...register('serviceCode', {
            required: 'Service code is required',
            pattern:  { value: /^[A-Za-z0-9-]+$/, message: 'Letters, numbers, hyphens only' },
            maxLength: { value: 20, message: 'Max 20 characters' },
          })}
          placeholder="e.g. AS-ME-01"
          disabled={isEditing}
          className={`input-base uppercase ${errors.serviceCode ? 'input-error' : ''} ${isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
        />
        {errors.serviceCode && <p className="mt-1 text-xs text-red-500">{errors.serviceCode.message}</p>}
      </div>

      {/* Service Name */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Service Name <span className="text-red-400">*</span>
        </label>
        <input
          {...register('serviceName', {
            required:  'Service name is required',
            maxLength: { value: 100, message: 'Max 100 characters' },
          })}
          placeholder="e.g. Asia – Middle East Express"
          className={`input-base ${errors.serviceName ? 'input-error' : ''}`}
        />
        {errors.serviceName && <p className="mt-1 text-xs text-red-500">{errors.serviceName.message}</p>}
      </div>

      {/* Default Vessel */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Default Vessel
        </label>
        <select {...register('defaultVesselId')} className="input-base">
          <option value="">No default vessel</option>
          {vessels.map(v => (
            <option key={v._id} value={v._id}>{v.vesselCode} — {v.vesselName}</option>
          ))}
        </select>
      </div>

      {/* Invoice setup */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Applicability <span className="text-red-400">*</span>
          </label>
          <select {...register('applicability', { required: true })} className="input-base">
            {SERVICE_APPLICABILITY.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Taxable <span className="text-red-400">*</span>
          </label>
          <select {...register('isTaxable', { required: true })} className="input-base">
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Revenue Account <span className="text-red-400">*</span>
        </label>
        <select {...register('revenueAccountId', { required: 'Revenue account is required' })} className={`input-base ${errors.revenueAccountId ? 'input-error' : ''}`}>
          <option value="">Select revenue account…</option>
          {revenueAccounts.map(a => <option key={a._id} value={a._id}>{a.code} — {a.name}</option>)}
        </select>
        {errors.revenueAccountId && <p className="mt-1 text-xs text-red-500">{errors.revenueAccountId.message}</p>}
        <p className="mt-1 text-[11px] text-gray-400">Prices are not stored on the service — they are entered on the booking or invoice.</p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Description
        </label>
        <textarea
          {...register('description')}
          rows={3}
          placeholder="Optional notes about this service…"
          className="input-base resize-none"
        />
      </div>

      {/* Status */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Status
        </label>
        <select {...register('status')} className="input-base">
          {SERVICE_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-md">
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn btn-primary btn-md"
        >
          {mutation.isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Service'}
        </button>
      </div>
    </form>
  );
}
