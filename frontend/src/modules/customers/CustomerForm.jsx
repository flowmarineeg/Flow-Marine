'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { customersService, CUSTOMER_TYPES } from '@/services/customers.service';
import { accountsService } from '@/services/accounts.service';
import Button from '@/components/ui/Button';

const LABEL = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const INPUT = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition';
const SECTION = 'text-[12px] font-semibold text-gray-600 uppercase tracking-wider pt-2 border-t border-gray-100';

const EMPTY = {
  customerCode: '', customerName: '', nameAr: '', customerType: '', country: '', address: '',
  registrationNumber: '', taxId: '', defaultCurrency: 'USD', arAccountId: '', status: 'Active', contacts: [],
};

const nul = (v) => (v === '' || v === undefined ? null : v);

export default function CustomerForm({ item = null, onSuccess, onCancel }) {
  const isEdit = !!item;
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm({ defaultValues: EMPTY });
  const { fields, append, remove } = useFieldArray({ control, name: 'contacts' });

  const { data: arAccounts = [] } = useQuery({
    queryKey: ['accounts', 'receivable'],
    queryFn: () => accountsService.lookup('receivable').then(r => r.data.data),
  });

  useEffect(() => {
    reset(isEdit && item ? {
      ...EMPTY, ...item,
      nameAr: item.nameAr || '', country: item.country || '', address: item.address || '',
      registrationNumber: item.registrationNumber || '', taxId: item.taxId || '',
      arAccountId: item.arAccountId?._id || item.arAccountId || '',
      contacts: (item.contacts || []).map(c => ({ name: c.name || '', title: c.title || '', email: c.email || '', phone: c.phone || '' })),
    } : EMPTY);
  }, [item]);

  const mutation = useMutation({
    mutationFn: (d) => {
      const payload = {
        customerCode: d.customerCode, customerName: d.customerName, nameAr: nul(d.nameAr), customerType: d.customerType,
        country: nul(d.country), address: nul(d.address), registrationNumber: nul(d.registrationNumber), taxId: nul(d.taxId),
        defaultCurrency: (d.defaultCurrency || 'USD').toUpperCase(), arAccountId: nul(d.arAccountId), status: d.status,
        contacts: d.contacts.filter(c => c.name?.trim()).map(c => ({ name: c.name.trim(), title: nul(c.title), email: nul(c.email), phone: nul(c.phone) })),
      };
      return isEdit ? customersService.update(item._id, payload) : customersService.create(payload);
    },
    onSuccess: () => { toast.success(isEdit ? 'Customer updated' : 'Customer created'); onSuccess?.(); },
    onError:   (e) => showErrorToast(e, 'save'),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Customer Code <span className="text-red-400">*</span></label>
          <input {...register('customerCode', { required: 'Code is required' })} className={`${INPUT} uppercase`} />
          {errors.customerCode && <p className="mt-1 text-[11px] text-red-500">{errors.customerCode.message}</p>}
        </div>
        <div>
          <label className={LABEL}>Customer Type <span className="text-red-400">*</span></label>
          <select {...register('customerType', { required: 'Customer type is required' })} className={`${INPUT} cursor-pointer`}>
            <option value="">Select type…</option>
            {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {errors.customerType && <p className="mt-1 text-[11px] text-red-500">{errors.customerType.message}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Customer Name (EN) <span className="text-red-400">*</span></label>
          <input {...register('customerName', { required: 'Name is required' })} className={INPUT} />
          {errors.customerName && <p className="mt-1 text-[11px] text-red-500">{errors.customerName.message}</p>}
        </div>
        <div><label className={LABEL}>Customer Name (AR)</label><input dir="rtl" {...register('nameAr')} className={INPUT} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL}>Country</label><input {...register('country')} className={INPUT} /></div>
        <div><label className={LABEL}>Default Currency</label><input maxLength={3} {...register('defaultCurrency')} className={`${INPUT} uppercase`} /></div>
      </div>
      <div><label className={LABEL}>Address</label><input {...register('address')} className={INPUT} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL}>Registration Number</label><input {...register('registrationNumber')} className={INPUT} /></div>
        <div><label className={LABEL}>Tax ID</label><input {...register('taxId')} className={INPUT} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>AR Account</label>
          <select {...register('arAccountId')} className={`${INPUT} cursor-pointer`}>
            <option value="">None</option>
            {arAccounts.map(a => <option key={a._id} value={a._id}>{a.code} — {a.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>Status</label>
          <select {...register('status')} className={INPUT}><option>Active</option><option>Inactive</option></select>
        </div>
      </div>

      <div className={SECTION}>Contacts</div>
      {fields.map((f, i) => (
        <div key={f.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
          <div><label className={LABEL}>Name</label><input {...register(`contacts.${i}.name`)} className={INPUT} /></div>
          <div><label className={LABEL}>Title</label><input {...register(`contacts.${i}.title`)} className={INPUT} /></div>
          <div><label className={LABEL}>Email</label><input type="email" {...register(`contacts.${i}.email`)} className={INPUT} /></div>
          <div><label className={LABEL}>Phone</label><input {...register(`contacts.${i}.phone`)} className={INPUT} /></div>
          <Button type="button" variant="secondary" onClick={() => remove(i)}>Remove</Button>
        </div>
      ))}
      <div><Button type="button" variant="secondary" onClick={() => append({ name: '', title: '', email: '', phone: '' })}>+ Add contact</Button></div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={mutation.isPending}>{isEdit ? 'Save Changes' : 'Create'}</Button>
      </div>
    </form>
  );
}
