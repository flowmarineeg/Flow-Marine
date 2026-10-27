'use client';

import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { accountingService } from '@/services/accounting.service';

const lc = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

export default function AccountForm({ item, headers, meta, onSuccess, onCancel }) {
  const qc = useQueryClient();
  const isEdit = !!item;
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      code: item?.code || '', name: item?.name || '', nameAr: item?.nameAr || '', parentId: item?.parentId || '',
      subledgerType: item?.subledgerType || 'NONE', allocationLevel: item?.allocationLevel || 'NONE',
      requiredDimensions: item?.requiredDimensions || [], defaultCurrency: item?.defaultCurrency || '',
      isActive: item ? String(item.isActive !== false) : 'true',
    },
  });

  const mutation = useMutation({
    mutationFn: (d) => {
      const payload = {
        name: d.name.trim(), nameAr: d.nameAr?.trim() || null, subledgerType: d.subledgerType, allocationLevel: d.allocationLevel,
        requiredDimensions: Array.isArray(d.requiredDimensions) ? d.requiredDimensions : (d.requiredDimensions ? [d.requiredDimensions] : []),
        defaultCurrency: d.defaultCurrency?.trim().toUpperCase() || null, isActive: d.isActive === 'true',
      };
      return isEdit ? accountingService.updateAccount(item._id, payload) : accountingService.createAccount({ ...payload, code: d.code.trim(), parentId: d.parentId });
    },
    onSuccess: () => { toast.success(isEdit ? 'Account updated' : 'Account created'); qc.invalidateQueries({ queryKey: ['chart-of-accounts'] }); onSuccess?.(); },
    onError: (e) => showErrorToast(e, 'save'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      {!isEdit && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lc}>Parent (header) <span className="text-red-400">*</span></label>
            <select {...register('parentId', { required: 'Parent is required' })} className={`input-base ${errors.parentId ? 'input-error' : ''}`}>
              <option value="">Select header…</option>
              {headers.map(h => <option key={h._id} value={h._id}>{h.code} — {h.name}</option>)}
            </select>
            {errors.parentId && <p className="mt-1 text-xs text-red-500">{errors.parentId.message}</p>}
          </div>
          <div>
            <label className={lc}>Code (6 digits) <span className="text-red-400">*</span></label>
            <input {...register('code', { required: 'Code is required', pattern: { value: /^\d{6}$/, message: '6 digits' } })} className={`input-base mono ${errors.code ? 'input-error' : ''}`} />
            {errors.code && <p className="mt-1 text-xs text-red-500">{errors.code.message}</p>}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lc}>Name (EN) <span className="text-red-400">*</span></label>
          <input {...register('name', { required: 'Name is required' })} className={`input-base ${errors.name ? 'input-error' : ''}`} />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
        </div>
        <div><label className={lc}>Name (AR)</label><input dir="rtl" {...register('nameAr')} className="input-base" /></div>
        <div>
          <label className={lc}>Sub-ledger</label>
          <select {...register('subledgerType')} className="input-base">{meta.subledgerTypes.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </div>
        <div>
          <label className={lc}>Allocation level</label>
          <select {...register('allocationLevel')} className="input-base">{meta.allocationLevels.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </div>
        <div><label className={lc}>Default currency</label><input maxLength={3} {...register('defaultCurrency')} className="input-base uppercase" /></div>
        <div>
          <label className={lc}>Active</label>
          <select {...register('isActive')} className="input-base"><option value="true">Yes</option><option value="false">No</option></select>
        </div>
      </div>
      <div>
        <p className={lc}>Required dimensions</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {meta.dimensions.map(d => (
            <label key={d} className="flex items-center gap-1.5"><input type="checkbox" value={d} {...register('requiredDimensions')} /> {d}</label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-md">Cancel</button>
        <button type="submit" disabled={mutation.isPending} className="btn btn-primary btn-md">{mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account'}</button>
      </div>
    </form>
  );
}
