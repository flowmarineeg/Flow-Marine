'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { containerTypesService } from '@/services/containerTypes.service';
import { CONTAINER_SIZES, CONTAINER_TYPES_LIST } from '@/utils/constants';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';

export default function ContainerTypeForm({ item = null, onSuccess, onCancel }) {
  const isEdit = !!item;
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    reset(isEdit && item
      ? { code: item.code, size: item.size, type: item.type }
      : { code: '', size: '', type: '' }
    );
  }, [item]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? containerTypesService.update(item._id, data)
      : containerTypesService.create(data),
    onSuccess: () => {
      toast.success(isEdit ? 'Container type updated' : 'Container type created');
      onSuccess?.();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Operation failed'),
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
