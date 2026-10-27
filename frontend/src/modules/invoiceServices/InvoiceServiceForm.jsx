'use client';

import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { invoiceServicesService } from '@/services/invoiceServices.service';
import { accountsService } from '@/services/accounts.service';
import { SERVICE_STATUS, SERVICE_APPLICABILITY } from '@/utils/constants';

const lc = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

export default function InvoiceServiceForm({ item, onSuccess, onCancel }) {
  const qc = useQueryClient();
  const isEditing = !!item;
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      serviceName: item?.serviceName || '',
      applicability: item?.applicability || 'SOC_ONLY',
      isTaxable: item ? String(!!item.isTaxable) : 'false',
      revenueAccountId: item?.revenueAccountId?._id || item?.revenueAccountId || '',
      status: item?.status || 'Active',
    },
  });

  const { data: revenueAccounts = [] } = useQuery({
    queryKey: ['accounts', 'revenue'],
    queryFn: () => accountsService.lookup('revenue').then(r => r.data.data),
  });

  const mutation = useMutation({
    mutationFn: (d) => {
      const payload = { ...d, isTaxable: d.isTaxable === 'true' };
      return isEditing ? invoiceServicesService.update(item._id, payload) : invoiceServicesService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Invoice service updated' : 'Invoice service created');
      qc.invalidateQueries({ queryKey: ['invoice-services'] });
      onSuccess?.();
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
      <div>
        <label className={lc}>Service Name <span className="text-red-400">*</span></label>
        <input {...register('serviceName', { required: 'Service name is required', maxLength: { value: 100, message: 'Max 100 characters' } })}
          placeholder="e.g. SOC Slot Booking, THC, Reefer Monitoring" className={`input-base ${errors.serviceName ? 'input-error' : ''}`} />
        <p className="mt-1 text-[11px] text-gray-400">This is the name displayed on invoices.</p>
        {errors.serviceName && <p className="mt-1 text-xs text-red-500">{errors.serviceName.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lc}>Applicability <span className="text-red-400">*</span></label>
          <select {...register('applicability', { required: true })} className="input-base">
            {SERVICE_APPLICABILITY.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lc}>Is Taxable <span className="text-red-400">*</span></label>
          <select {...register('isTaxable', { required: true })} className="input-base">
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
      </div>
      <div>
        <label className={lc}>Revenue Account <span className="text-red-400">*</span></label>
        <select {...register('revenueAccountId', { required: 'Revenue account is required' })} className={`input-base ${errors.revenueAccountId ? 'input-error' : ''}`}>
          <option value="">Select revenue account…</option>
          {revenueAccounts.map(a => <option key={a._id} value={a._id}>{a.code} — {a.name}</option>)}
        </select>
        {errors.revenueAccountId && <p className="mt-1 text-xs text-red-500">{errors.revenueAccountId.message}</p>}
        <p className="mt-1 text-[11px] text-gray-400">Chart of accounts, revenue group 4. Prices are entered on the booking or invoice, not here.</p>
      </div>
      <div>
        <label className={lc}>Status</label>
        <select {...register('status')} className="input-base">
          {SERVICE_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-md">Cancel</button>
        <button type="submit" disabled={mutation.isPending} className="btn btn-primary btn-md">
          {mutation.isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Invoice Service'}
        </button>
      </div>
    </form>
  );
}
