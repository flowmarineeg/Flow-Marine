'use client';

import { useQuery } from '@tanstack/react-query';
import { partnersService } from '@/services/partners.service';

const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ic = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:border-teal-500 focus:ring-teal-500/10 transition disabled:bg-gray-50 disabled:text-gray-400';

/** Percent string ("33.33") -> integer basis points (3333). NaN-safe. */
export const pctToBp = (pct) => {
  const n = Number(pct);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const bpToPct = (bp) => (Number(bp) / 100).toFixed(2);

/** Client-side mirror of the server rules (total 100.00%, no duplicate partner, exactly one lead). Returns an error string or null. */
export const validateRows = (rows) => {
  if (!rows.length) return 'Add at least one JV partner';
  if (rows.some((r) => !r.partnerId)) return 'Select a partner on every row';
  if (new Set(rows.map((r) => r.partnerId)).size !== rows.length) return 'The same partner cannot appear twice';
  if (rows.some((r) => pctToBp(r.pct) < 1)) return 'Every share must be greater than 0';
  const total = rows.reduce((s, r) => s + pctToBp(r.pct), 0);
  if (total !== 10000) return `Shares must total 100.00% (now ${bpToPct(total)}%)`;
  if (rows.filter((r) => r.isLead).length !== 1) return 'Exactly one partner must be the Lead Operator';
  return null;
};

export default function JvMatrix({ rows, onChange, disabled = false }) {
  const { data: partners = [] } = useQuery({
    queryKey: ['partners', 'active-all'],
    queryFn: () => partnersService.list({ limit: 200, status: 'Active' }).then((r) => r.data.data),
  });

  const total = rows.reduce((s, r) => s + pctToBp(r.pct), 0);
  const error = validateRows(rows);
  const set = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const setLead = (i) => onChange(rows.map((r, idx) => ({ ...r, isLead: idx === i })));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_130px_90px_auto] gap-3 items-end">
          <div>
            <label className={lc}>Partner <span className="text-red-400">*</span></label>
            <select disabled={disabled} value={r.partnerId} onChange={(e) => set(i, { partnerId: e.target.value })} className={`${ic} cursor-pointer`}>
              <option value="">Select partner…</option>
              {partners.map((p) => <option key={p._id} value={p._id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lc}>Share % <span className="text-red-400">*</span></label>
            <input disabled={disabled} type="number" min="0.01" max="100" step="0.01" value={r.pct}
              onChange={(e) => set(i, { pct: e.target.value })} className={ic} />
          </div>
          <div>
            <label className={lc}>Lead</label>
            <label className="flex items-center gap-2 h-[38px] cursor-pointer text-[13px] text-gray-600">
              <input disabled={disabled} type="radio" name="jv-lead" checked={!!r.isLead} onChange={() => setLead(i)} className="accent-teal-600" />
              Operator
            </label>
          </div>
          <button type="button" disabled={disabled} onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="text-[12px] text-red-500 hover:underline h-[38px] disabled:opacity-40">Remove</button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" disabled={disabled}
          onClick={() => onChange([...rows, { partnerId: '', pct: '', isLead: rows.length === 0 }])}
          className="text-[12px] font-semibold text-teal-600 hover:underline disabled:opacity-40">+ Add partner</button>
        <span className={`mono text-[12px] font-bold ${total === 10000 ? 'text-green-600' : 'text-red-500'}`}>
          Total {bpToPct(total)}%
        </span>
      </div>
      {error && !disabled && <p className="text-[11px] text-red-500">{error}</p>}
      {disabled && <p className="text-[11px] text-gray-400">Shares are locked: this vessel already has accounting entries.</p>}
    </div>
  );
}
