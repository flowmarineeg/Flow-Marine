'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { partnersService } from '@/services/partners.service';
import Button from '@/components/ui/Button';

const LABEL = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const INPUT = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition';

export default function PartnerForm({ item = null, onSuccess, onCancel }) {
  const isEdit = !!item;
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    reset(isEdit && item
      ? { code: item.code, name: item.name, status: item.status, person: item.contact?.person || '', email: item.contact?.email || '', phone: item.contact?.phone || '', address: item.contact?.address || '', notes: item.notes || '' }
      : { code: '', name: '', status: 'Active', person: '', email: '', phone: '', address: '', notes: '' }
    );
  }, [item]);

  const mutation = useMutation({
    mutationFn: (d) => {
      const payload = {
        code: d.code, name: d.name, status: d.status, notes: d.notes || null,
        contact: { person: d.person || null, email: d.email || null, phone: d.phone || null, address: d.address || null },
      };
      return isEdit ? partnersService.update(item._id, payload) : partnersService.create(payload);
    },
    onSuccess: () => { toast.success(isEdit ? 'Partner updated' : 'Partner created'); onSuccess?.(); },
    onError:   (e) => showErrorToast(e, 'save'),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Code <span className="text-red-400">*</span></label>
          <input {...register('code', { required: 'Code is required' })} placeholder="e.g. PA" className={`${INPUT} uppercase`} />
          {errors.code && <p className="mt-1 text-[11px] text-red-500">{errors.code.message}</p>}
        </div>
        <div>
          <label className={LABEL}>Status</label>
          <select {...register('status')} className={INPUT}>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>
      </div>
      <div>
        <label className={LABEL}>Name <span className="text-red-400">*</span></label>
        <input {...register('name', { required: 'Name is required' })} className={INPUT} />
        {errors.name && <p className="mt-1 text-[11px] text-red-500">{errors.name.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL}>Contact Person</label><input {...register('person')} className={INPUT} /></div>
        <div><label className={LABEL}>Phone</label><input {...register('phone')} className={INPUT} /></div>
      </div>
      <div>
        <label className={LABEL}>Email</label>
        <input type="email" {...register('email')} className={INPUT} />
      </div>
      <div><label className={LABEL}>Address</label><input {...register('address')} className={INPUT} /></div>
      <div><label className={LABEL}>Notes</label><textarea rows={2} {...register('notes')} className={INPUT} /></div>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={mutation.isPending}>{isEdit ? 'Save Changes' : 'Create'}</Button>
      </div>
    </form>
  );
}
