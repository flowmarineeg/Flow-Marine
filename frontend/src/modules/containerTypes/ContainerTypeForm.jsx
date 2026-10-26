'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { containerTypesService } from '@/services/containerTypes.service';
import { CONTAINER_SIZES, CONTAINER_TYPES_LIST } from '@/utils/constants';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';

export default function ContainerTypeForm({ item = null, onSuccess, onCancel }) {
  const isEdit = !!item;
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();

  useEffect(() => {
    reset(isEdit && item
      ? { code: item.code, isoCode: item.isoCode || '', size: item.size, type: item.type }
      : { code: '', isoCode: '', size: '', type: '' }
    );
  }, [item]);

  const size = watch('size');
  const teuFactor = size ? (String(size).startsWith('20') ? 1 : 2) : null;

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, isoCode: data.isoCode?.trim() ? data.isoCode.trim().toUpperCase() : null };
      return isEdit ? containerTypesService.update(item._id, payload) : containerTypesService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Container type updated' : 'Container type created');
      onSuccess?.();
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col gap-4">

      <div>
        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Code <span className="text-red-400">*</span>
        </label>
        <input
          {...register('code', { required: 'Code is required' })}
          placeholder="e.g. 40HC"
          className={`w-full text-[13px] border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 transition uppercase ${
            errors.code ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'
          }`}
        />
        {errors.code && <p className="mt-1 text-[11px] text-red-500">{errors.code.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">ISO Code</label>
          <input
            {...register('isoCode', { pattern: { value: /^[0-9A-Za-z]{2}[A-Za-z][0-9]$/, message: 'e.g. 22G1, 45G1, 42R1' } })}
            placeholder="e.g. 22G1" maxLength={4}
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition uppercase"
          />
          {errors.isoCode && <p className="mt-1 text-[11px] text-red-500">{errors.isoCode.message}</p>}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">TEU Factor</label>
          <input readOnly value={teuFactor ?? ''} placeholder="from size"
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Size <span className="text-red-400">*</span>
          </label>
          <select
            {...register('size', { required: 'Size is required' })}
            className={`w-full text-[13px] border rounded-lg px-3 py-2 bg-white cursor-pointer focus:outline-none focus:ring-2 transition ${
              errors.size ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'
            }`}
          >
            <option value="">Select size…</option>
            {CONTAINER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {errors.size && <p className="mt-1 text-[11px] text-red-500">{errors.size.message}</p>}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Type <span className="text-red-400">*</span>
          </label>
          <select
            {...register('type', { required: 'Type is required' })}
            className={`w-full text-[13px] border rounded-lg px-3 py-2 bg-white cursor-pointer focus:outline-none focus:ring-2 transition ${
              errors.type ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'
            }`}
          >
            <option value="">Select type…</option>
            {CONTAINER_TYPES_LIST.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {errors.type && <p className="mt-1 text-[11px] text-red-500">{errors.type.message}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={mutation.isPending}>
          {isEdit ? 'Save Changes' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
