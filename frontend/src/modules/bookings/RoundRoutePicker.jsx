'use client';

/**
 * Bookings sprint 2026-11-10 — Round + POL + POD picker with the voyage found by the server.
 *
 * There is no voyage selector: the user picks the round and the booking's own POL/POD (any ports of the
 * round's legs, intermediate ports included) and the system shows which voyage will carry it. Only when
 * several voyages tie does a small dropdown of those candidates appear (the sent `voyageId` is that pick).
 *
 * Controlled: value = { roundId, polId, podId, voyageId }, onChange(nextValue).
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bookingsService } from '@/services/bookings.service';
import { getVoyageLabel } from '@/utils/voyageLabel';

const sc = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition cursor-pointer disabled:opacity-60';
const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

const portLabel = (p) => `${p.name || '?'}${p.code ? ` (${p.code})` : ''}${p.legs?.length > 1 ? ` — calls ${p.legs.length}×` : ''}`;

export default function RoundRoutePicker({ value, onChange, rounds = [], ports = [], disabled = false, errors = {} }) {
  const { roundId = '', polId = '', podId = '', voyageId = '' } = value || {};
  const ready = !!roundId && !!polId && !!podId && polId !== podId;

  const { data: res, isFetching, error } = useQuery({
    queryKey: ['resolve-voyage', roundId, polId, podId],
    queryFn:  () => bookingsService.resolveVoyage({ roundId, polId, podId }).then(r => r.data.data),
    enabled:  ready && !disabled,
    staleTime: 15 * 1000,
    retry: false,
  });

  // a previously picked candidate is only valid while it is still among the candidates
  useEffect(() => {
    if (!voyageId) return;
    if (res && !(res.candidates || []).some(c => c.voyageId === voyageId)) onChange({ ...value, voyageId: '' });
  }, [res]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => onChange({ ...value, voyageId: '', ...patch });
  const ambiguous = res?.status === 'ambiguous';
  const unresolved = ready && !isFetching && (res?.status === 'unresolved' || !!error);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={lc}>Round <span className="text-red-400">*</span></label>
          <select value={roundId} disabled={disabled} className={sc}
            onChange={e => onChange({ roundId: e.target.value, polId: '', podId: '', voyageId: '' })}>
            <option value="">Select round…</option>
            {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
          </select>
          {errors.roundId && <p className="mt-1 text-[11px] text-red-500">{errors.roundId}</p>}
        </div>
        <div>
          <label className={lc}>POL <span className="text-red-400">*</span></label>
          <select value={polId} disabled={disabled || !roundId} className={sc} onChange={e => set({ polId: e.target.value })}>
            <option value="">{roundId ? 'Select POL…' : 'Select a round first…'}</option>
            {ports.map(p => <option key={p.portId} value={p.portId}>{portLabel(p)}</option>)}
          </select>
          {errors.polId && <p className="mt-1 text-[11px] text-red-500">{errors.polId}</p>}
        </div>
        <div>
          <label className={lc}>POD <span className="text-red-400">*</span></label>
          <select value={podId} disabled={disabled || !roundId} className={sc} onChange={e => set({ podId: e.target.value })}>
            <option value="">{roundId ? 'Select POD…' : 'Select a round first…'}</option>
            {ports.filter(p => p.portId !== polId).map(p => <option key={p.portId} value={p.portId}>{portLabel(p)}</option>)}
          </select>
          {errors.podId && <p className="mt-1 text-[11px] text-red-500">{errors.podId}</p>}
        </div>
      </div>

      {ready && !disabled && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Voyage (assigned automatically)</p>
          {isFetching && <p className="text-[13px] text-gray-400">Finding the voyage…</p>}
          {!isFetching && res?.status === 'resolved' && res.voyage && (
            <p className="text-[13px] text-gray-700">
              <span className="mono font-bold text-teal-600">{getVoyageLabel(res.voyage)}</span>
              {res.voyage.direction && <span className="ml-2 text-gray-500">{res.voyage.direction}bound</span>}
              <span className="ml-2 text-gray-400">[{res.voyage.status}]</span>
              {res.ranked && <span className="ml-2 text-[11px] text-gray-400">earliest of {res.candidates.length} runs</span>}
            </p>
          )}
          {!isFetching && ambiguous && (
            <div>
              <p className="text-[12px] text-orange-600 mb-2">Several voyages of this round run from this POL to this POD — choose the intended one.</p>
              <select value={voyageId} className={sc} onChange={e => onChange({ ...value, voyageId: e.target.value })}>
                <option value="">Select voyage…</option>
                {res.candidates.map(c => (
                  <option key={c.voyageId} value={c.voyageId}>
                    {c.voyageName || c.voyageNumber} — {c.direction}bound [{c.status}]
                  </option>
                ))}
              </select>
              {errors.voyageId && <p className="mt-1 text-[11px] text-red-500">{errors.voyageId}</p>}
            </div>
          )}
          {unresolved && (
            <p className="text-[12px] text-red-500">
              No voyage of this round runs from this POL to this POD in that direction. Check the voyages of the round.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Client-side validation shared by the booking forms. Returns { field: message }. */
export const validateRoute = (value, { needsPick = false } = {}) => {
  const e = {};
  if (!value?.roundId) e.roundId = 'Round is required';
  if (!value?.polId)   e.polId = 'POL is required';
  if (!value?.podId)   e.podId = 'POD is required';
  if (value?.polId && value?.podId && value.polId === value.podId) e.podId = 'POL and POD must differ';
  if (needsPick && !value?.voyageId) e.voyageId = 'Choose a voyage';
  return e;
};
