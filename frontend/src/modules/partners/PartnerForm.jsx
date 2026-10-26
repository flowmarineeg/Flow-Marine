'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { partnersService } from '@/services/partners.service';
import Button from '@/components/ui/Button';

const LABEL = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const INPUT = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition';
const SECTION = 'text-[12px] font-semibold text-gray-600 uppercase tracking-wider pt-2 border-t border-gray-100';

const EMPTY = {
  code: '', name: '', nameAr: '', country: '', address: '', registrationNumber: '', taxId: '',
  baseCurrency: 'USD', status: 'Active', notes: '',
  contacts: [],
  bank: { bankName: '', bankAddress: '', usdAccountNumber: '', usdIban: '', swiftCode: '' },
};

const fromItem = (item) => ({
  ...EMPTY,
  code: item.code, name: item.name, nameAr: item.nameAr || '', country: item.country || '',
  address: item.address || item.contact?.address || '', registrationNumber: item.registrationNumber || '',
  taxId: item.taxId || '', baseCurrency: item.baseCurrency || 'USD', status: item.status, notes: item.notes || '',
  contacts: (item.contacts?.length ? item.contacts : (item.contact?.person || item.contact?.email
    ? [{ name: item.contact.person || item.contact.email, title: '', email: item.contact.email || '', phone: item.contact.phone || '' }]
    : [])).map((c) => ({ name: c.name || '', title: c.title || '', email: c.email || '', phone: c.phone || '' })),
  bank: { ...EMPTY.bank, ...(item.bank || {}) },
});

const nul = (v) => (v === '' || v === undefined ? null : v);

export default function PartnerForm({ item = null, onSuccess, onCancel }) {
  const isEdit = !!item;
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm({ defaultValues: EMPTY });
  const { fields, append, remove } = useFieldArray({ control, name: 'contacts' });

  useEffect(() => { reset(isEdit && item ? fromItem(item) : EMPTY); }, [item]);

  const mutation = useMutation({
    mutationFn: (d) => {
      const payload = {
        code: d.code, name: d.name, nameAr: nul(d.nameAr), country: nul(d.country), address: nul(d.address),
        registrationNumber: nul(d.registrationNumber), taxId: nul(d.taxId),
        baseCurrency: (d.baseCurrency || 'USD').toUpperCase(), status: d.status, notes: nul(d.notes),
        contacts: d.contacts.filter((c) => c.name?.trim()).map((c) => ({ name: c.name.trim(), title: nul(c.title), email: nul(c.email), phone: nul(c.phone) })),
        bank: Object.fromEntries(Object.entries(d.bank).map(([k, v]) => [k, nul(v)])),
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
          <label className={LABEL}>Partner Code <span className="text-red-400">*</span></label>
          <input {...register('code', { required: 'Code is required' })} placeholder="e.g. PA" className={`${INPUT} uppercase`} />
          {errors.code && <p className="mt-1 text-[11px] text-red-500">{errors.code.message}</p>}
        </div>
        <div>
          <label className={LABEL}>Status</label>
          <select {...register('status')} className={INPUT}><option>Active</option><option>Inactive</option></select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Partner Name (EN) <span className="text-red-400">*</span></label>
          <input {...register('name', { required: 'Name is required' })} className={INPUT} />
          {errors.name && <p className="mt-1 text-[11px] text-red-500">{errors.name.message}</p>}
        </div>
        <div><label className={LABEL}>Partner Name (AR)</label><input dir="rtl" {...register('nameAr')} className={INPUT} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL}>Country</label><input {...register('country')} className={INPUT} /></div>
        <div><label className={LABEL}>Base Currency</label><input maxLength={3} {...register('baseCurrency')} className={`${INPUT} uppercase`} /></div>
      </div>
      <div><label className={LABEL}>Address</label><input {...register('address')} className={INPUT} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL}>Registration Number</label><input {...register('registrationNumber')} className={INPUT} /></div>
        <div><label className={LABEL}>Tax ID</label><input {...register('taxId')} className={INPUT} /></div>
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

      <div className={SECTION}>Bank Details</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL}>Bank Name</label><input {...register('bank.bankName')} className={INPUT} /></div>
        <div><label className={LABEL}>SWIFT Code</label><input {...register('bank.swiftCode')} className={`${INPUT} uppercase`} /></div>
      </div>
      <div><label className={LABEL}>Bank Address</label><input {...register('bank.bankAddress')} className={INPUT} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL}>USD Account Number</label><input {...register('bank.usdAccountNumber')} className={INPUT} /></div>
        <div><label className={LABEL}>USD IBAN</label><input {...register('bank.usdIban')} className={`${INPUT} uppercase`} /></div>
      </div>

      <div><label className={LABEL}>Notes</label><textarea rows={2} {...register('notes')} className={INPUT} /></div>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={mutation.isPending}>{isEdit ? 'Save Changes' : 'Create'}</Button>
      </div>
    </form>
  );
}
