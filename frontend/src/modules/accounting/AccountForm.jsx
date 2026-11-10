'use client';

import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { accountingService } from '@/services/accounting.service';

const lc = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

export default function AccountForm({ item, headers, meta, defaultParentId = '', onSuccess, onCancel }) {
  const qc = useQueryClient();
  const isEdit = !!item;
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      kind: item?.isGroup ? 'header' : 'posting',
      code: item?.code || '', name: item?.name || '', nameAr: item?.nameAr || '', parentId: item?.parentId || defaultParentId,
      subledgerType: item?.subledgerType || 'NONE', allocationLevel: item?.allocationLevel || 'NONE',
      requiredDimensions: item?.requiredDimensions || [], defaultCurrency: item?.defaultCurrency || '',
      isActive: item ? String(item.isActive !== false) : 'true',
    },
  });

  const rootHeader = isEdit && !!item.isGroup && !item.parentId;
  const isHeader = isEdit ? !!item.isGroup : watch('kind') === 'header';

  const mutation = useMutation({
    mutationFn: (d) => {
      const base = { name: d.name.trim(), nameAr: d.nameAr?.trim() || null, isActive: d.isActive === 'true' };
      const payload = isHeader ? base : {
        ...base, subledgerType: d.subledgerType, allocationLevel: d.allocationLevel,
        requiredDimensions: Array.isArray(d.requiredDimensions) ? d.requiredDimensions : (d.requiredDimensions ? [d.requiredDimensions] : []),
        defaultCurrency: d.defaultCurrency?.trim().toUpperCase() || null,
      };
      return isEdit ? accountingService.updateAccount(item._id, { ...payload, code: d.code.trim(), parentId: d.parentId || null }) : accountingService.createAccount({ ...payload, code: d.code.trim(), parentId: d.parentId, isGroup: isHeader });
    },
    onSuccess: () => { toast.success(isEdit ? 'Account updated' : 'Account created'); qc.invalidateQueries({ queryKey: ['chart-of-accounts'] }); onSuccess?.(); },
    onError: (e) => showErrorToast(e, 'save'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      {isEdit && <p className="text-xs text-gray-500">Account <span className="mono font-semibold">{item.code}</span> · {item.type} · {item.isGroup ? 'Header' : 'Posting'} — the code and parent can be changed; the type follows the parent.</p>}
      {!isEdit && (
        <div>
          <label className={lc}>Kind</label>
          <select {...register('kind')} className="input-base">
            <option value="posting">Posting account (takes entries)</option>
            <option value="header">Header / group (holds other accounts)</option>
          </select>
        </div>
      )}
      {(
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lc}>Parent (header) {!rootHeader && <span className="text-red-400">*</span>}</label>
            <select {...register('parentId', { required: rootHeader ? false : 'Parent is required' })} className={`input-base ${errors.parentId ? 'input-error' : ''}`}>
              <option value="">{rootHeader ? '— none (top level) —' : 'Select header…'}</option>
              {headers.filter(h => !item || h._id !== item._id).map(h => <option key={h._id} value={h._id}>{h.code} — {h.name}</option>)}
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
        {!isHeader && <>
        <div>
          <label className={lc}>Sub-ledger</label>
          <select {...register('subledgerType')} className="input-base">{meta.subledgerTypes.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </div>
        <div>
          <label className={lc}>Allocation level</label>
          <select {...register('allocationLevel')} className="input-base">{meta.allocationLevels.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </div>
        <div><label className={lc}>Default currency</label><input maxLength={3} {...register('defaultCurrency')} className="input-base uppercase" /></div>
        </>}
        <div>
          <label className={lc}>Active</label>
          <select {...register('isActive')} className="input-base"><option value="true">Yes</option><option value="false">No</option></select>
        </div>
      </div>
      {!isHeader && <div>
        <p className={lc}>Required dimensions</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {meta.dimensions.map(d => (
            <label key={d} className="flex items-center gap-1.5"><input type="checkbox" value={d} {...register('requiredDimensions')} /> {d}</label>
          ))}
        </div>
      </div>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-md">Cancel</button>
        <button type="submit" disabled={mutation.isPending} className="btn btn-primary btn-md">{mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account'}</button>
      </div>
    </form>
  );
}
