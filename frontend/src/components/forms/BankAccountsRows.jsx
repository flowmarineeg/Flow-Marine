'use client';

import { useFieldArray } from 'react-hook-form';

const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ic = (err) => `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const ec = 'mt-1 text-[11px] text-red-500';

export const emptyBankAccount = () => ({ bankName: '', swiftCode: '', bankAddress: '', usdAccountNumber: '', usdIban: '' });

/** Keeps only the bank fields the API accepts and drops rows left completely blank. */
export const cleanBankAccounts = (rows) => (rows || [])
  .map((r) => ({
    bankName: (r.bankName || '').trim(),
    swiftCode: (r.swiftCode || '').trim() || null,
    bankAddress: (r.bankAddress || '').trim() || null,
    usdAccountNumber: (r.usdAccountNumber || '').trim() || null,
    usdIban: (r.usdIban || '').trim() || null,
  }))
  .filter((r) => r.bankName || r.swiftCode || r.bankAddress || r.usdAccountNumber || r.usdIban);

// Repeatable bank-detail rows (Agents and Customers). Use inside a react-hook-form form.
export default function BankAccountsRows({ control, register, errors, name = 'bankAccounts' }) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const rowErr = (i, k) => errors?.[name]?.[i]?.[k];

  return (
    <div className="flex flex-col gap-4">
      {fields.length === 0 && <p className="text-[13px] text-gray-400">No bank details yet.</p>}
      {fields.map((f, i) => (
        <div key={f.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>Bank Name <span className="text-red-400">*</span></label>
              <input {...register(`${name}.${i}.bankName`, { required: 'Bank name is required' })} className={ic(rowErr(i, 'bankName'))} />
              {rowErr(i, 'bankName') && <p className={ec}>{rowErr(i, 'bankName').message}</p>}
            </div>
            <div>
              <label className={lc}>SWIFT Code</label>
              <input maxLength={11} {...register(`${name}.${i}.swiftCode`)} placeholder="e.g. NBEGEGCX" className={`${ic(false)} uppercase`} />
            </div>
            <div className="sm:col-span-2">
              <label className={lc}>Bank Address</label>
              <input {...register(`${name}.${i}.bankAddress`)} className={ic(false)} />
            </div>
            <div>
              <label className={lc}>USD Account Number</label>
              <input {...register(`${name}.${i}.usdAccountNumber`)} className={ic(false)} />
            </div>
            <div>
              <label className={lc}>USD IBAN</label>
              <input maxLength={34} {...register(`${name}.${i}.usdIban`)} className={`${ic(false)} uppercase`} />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button type="button" onClick={() => remove(i)} className="text-[12px] text-red-500 hover:underline">Remove bank</button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" onClick={() => append(emptyBankAccount())} className="text-[12px] font-semibold text-teal-600 hover:underline">+ Add bank details</button>
      </div>
    </div>
  );
}
