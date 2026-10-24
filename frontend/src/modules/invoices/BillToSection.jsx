'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { invoicesService } from '@/services/invoices.service';

const ic = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

// ── Bill To (PDF contact details) — Sprint 047. Always editable regardless
// of the invoice's lock status (not financial data), own separate form/
// mutation via PUT /invoices/:id/bill-to.
export default function BillToSection({ item }) {
  const qc = useQueryClient();
  const [billTo, setBillTo] = useState({
    phone:   item.billTo?.phone   || '',
    mobile:  item.billTo?.mobile  || '',
    email:   item.billTo?.email   || '',
    jobCode: item.billTo?.jobCode || '',
    taxId:   item.billTo?.taxId   || '',
    address: item.billTo?.address || '',
    office:  item.billTo?.office  || '',
  });

  const mutation = useMutation({
    mutationFn: (data) => invoicesService.updateBillTo(item._id, data),
    onSuccess: () => {
      toast.success('Bill To details saved');
      qc.invalidateQueries(['invoice', item._id]);
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  const field = (key, label) => (
    <div>
      <label className={lc}>{label}</label>
      <input
        value={billTo[key]}
        onChange={e => setBillTo(prev => ({ ...prev, [key]: e.target.value }))}
        className={ic(false)}
      />
    </div>
  );

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutation.mutate(billTo); }}
      className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4"
    >
      <div>
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Bill To (PDF)</p>
        <p className="text-[11px] text-gray-400 mt-1">
          Shown on the generated invoice PDF only — always editable, independent of the invoice&apos;s lock status.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field('phone', 'Phone')}
        {field('mobile', 'Mobile')}
        {field('email', 'Email')}
        {field('jobCode', 'Job Code')}
        {field('taxId', 'Tax ID')}
        {field('office', 'Office')}
      </div>
      {field('address', 'Address')}
      <div className="flex justify-end">
        <button type="submit" disabled={mutation.isPending} className="btn btn-primary btn-md">
          {mutation.isPending ? 'Saving…' : 'Save Bill To'}
        </button>
      </div>
    </form>
  );
}
