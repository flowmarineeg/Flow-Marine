'use client';

import { useState } from 'react';

const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ic = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition';

const day = (d) => (d ? String(d).split('T')[0] : '—');
const money = (v) => (v === null || v === undefined || v === '' ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const EMPTY = { charterPartyDate: '', deliveryDate: '', deliveryPrice: '', redeliveryDate: '' };

/** Client-side mirror of the server rules for one entry. Returns an error string or null. */
export const charterEntryError = (e) => {
  if (!e.deliveryDate || !e.redeliveryDate) return 'Delivery and redelivery dates are required';
  if (new Date(e.deliveryDate) >= new Date(e.redeliveryDate)) return 'Redelivery date must be after delivery date';
  if (e.deliveryPrice !== '' && Number(e.deliveryPrice) < 0) return 'Price cannot be negative';
  return null;
};

/**
 * Charter-party history (append-only): shows the latest entry, the full history on demand, and adds new entries.
 * entries: [{ _id?, charterPartyDate, deliveryDate, deliveryPrice, redeliveryDate }]
 */
export default function CharterHistory({ entries, onChange }) {
  const [adding, setAdding] = useState(entries.length === 0);
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState(null);

  const latest = entries.length ? entries[entries.length - 1] : null;
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const add = () => {
    const err = charterEntryError(draft);
    if (err) return setError(err);
    onChange([...entries, { ...draft }]);
    setDraft(EMPTY); setError(null); setAdding(false);
  };

  return (
    <div className="sm:col-span-2 border border-gray-200 rounded-lg p-4 bg-gray-50/40">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Charter Party</p>

      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px] text-gray-700 mb-3">
          <div><span className={lc}>C/P Date</span>{day(latest.charterPartyDate)}</div>
          <div><span className={lc}>Delivery</span>{day(latest.deliveryDate)} <span className="text-gray-400">·</span> {money(latest.deliveryPrice)}</div>
          <div><span className={lc}>Redelivery</span>{day(latest.redeliveryDate)}</div>
        </div>
      )}

      <div className="flex gap-4 mb-1">
        {!adding && <button type="button" onClick={() => setAdding(true)} className="text-[12px] font-semibold text-teal-600 hover:underline">+ Add new charter entry</button>}
        {entries.length > 0 && (
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-[12px] font-semibold text-gray-500 hover:underline">
            {showHistory ? 'Hide history' : `View history (${entries.length})`}
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>Charter Party Date</label>
              <input type="date" value={draft.charterPartyDate} onChange={(e) => set('charterPartyDate', e.target.value)} className={ic} />
            </div>
            <div />
            <div>
              <label className={lc}>Delivery Date <span className="text-red-400">*</span></label>
              <input type="date" value={draft.deliveryDate} onChange={(e) => set('deliveryDate', e.target.value)} className={ic} />
            </div>
            <div>
              <label className={lc}>Delivery Price (USD)</label>
              <input type="number" min="0" step="0.01" value={draft.deliveryPrice} onChange={(e) => set('deliveryPrice', e.target.value)} placeholder="e.g. 12500.00" className={ic} />
            </div>
            <div>
              <label className={lc}>Redelivery Date <span className="text-red-400">*</span></label>
              <input type="date" value={draft.redeliveryDate} onChange={(e) => set('redeliveryDate', e.target.value)} className={ic} />
            </div>
          </div>
          {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
          <div className="flex gap-3 mt-3">
            <button type="button" onClick={add} className="text-[12px] font-semibold text-teal-600 hover:underline">Add entry</button>
            {entries.length > 0 && <button type="button" onClick={() => { setAdding(false); setError(null); setDraft(EMPTY); }} className="text-[12px] text-gray-500 hover:underline">Cancel</button>}
          </div>
        </div>
      )}

      {showHistory && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="py-1 pr-3">C/P date</th><th className="pr-3">Delivery</th><th className="pr-3">Delivery price</th>
                <th className="pr-3">Redelivery</th><th />
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((e, i) => (
                <tr key={e._id || `new-${entries.length - 1 - i}`} className="border-t border-gray-100 text-gray-700">
                  <td className="py-1 pr-3">{day(e.charterPartyDate)}</td>
                  <td className="pr-3">{day(e.deliveryDate)}</td><td className="pr-3">{money(e.deliveryPrice)}</td>
                  <td className="pr-3">{day(e.redeliveryDate)}</td>
                  <td className="text-amber-600">{e._id ? (i === 0 ? 'current' : '') : 'unsaved'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
