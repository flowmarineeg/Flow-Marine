'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm, useFieldArray }        from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { bookingsService }       from '@/services/bookings.service';
import { customersService } from '@/services/customers.service';
import { useBookingLookups }     from '@/hooks/useBookingLookups';
import RoundRoutePicker, { validateRoute } from './RoundRoutePicker';
import { BOOKING_STATUS }        from '@/utils/constants';
import { getVoyageLabel }        from '@/utils/voyageLabel';

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00';

const ic = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800
   focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ec = 'mt-1 text-[11px] text-red-500';

// Sprint 042 — standardized on a single required-only convention: red
// asterisk for required, nothing at all for optional (the `optional` prop
// is intentionally no longer rendered).
function FieldLabel({ children, required }) {
  return (
    <label className={lc}>
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

const SectionCard = ({ title, children }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>
    {children}
  </div>
);

const EMPTY_ROW = {
  containerTypeId: '',
  quantity:        1,
  rate:            0,
  dg:              false,
  dgValue:         '',
  commodity:       '',
  vgm:             '',
};

export default function ManualBookingForm({ item, onSuccess, onCancel }) {
  const qc        = useQueryClient();
  const isEditing = !!item;
  const isLocked  = ['Cancelled', 'Final Loading'].includes(item?.status);
  // Bookings sprint 2026-11-10: round + the booking's own POL/POD; the voyage is assigned by the server
  const [route, setRoute] = useState({ roundId: '', polId: '', podId: '', voyageId: '' });
  const [routeErrors, setRouteErrors] = useState({});

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: {
      partnerId: item?.partnerId?._id || item?.partnerId || '',
      agentId:  item?.agentId?._id  || item?.agentId  || '',
      customerId: item?.customerId?._id || item?.customerId || '',
      remarks:  item?.remarks || '',
      status:   item?.status  || 'Pending',
      cargoRows: item?.cargoRows?.length
        ? item.cargoRows.map(r => ({
            containerTypeId: String(r.containerTypeId?._id || r.containerTypeId || ''),
            quantity:        r.quantity,
            rate:            r.rate,
            dg:              r.dg ?? false,
            dgValue:         r.dgValue || '',
            commodity:       r.commodity || '',
            vgm:             r.vgm ?? '',
          }))
        : [{ ...EMPTY_ROW }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'cargoRows' });
  const watchedRows     = watch('cargoRows');

  // Live grand total
  const grandTotal = useMemo(
    () => (watchedRows || []).reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.rate) || 0), 0),
    [watchedRows]
  );

  // Pick-lists (also work for partner users)
  const { agents, rounds, containerTypes, ports, partners, isPartnerUser } = useBookingLookups(route.roundId);

  // Customers (optional end customer / shipper)
  const { data: customerData } = useQuery({
    queryKey: ['customers-dropdown'],
    queryFn:  () => customersService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
    enabled:  !isPartnerUser, // partner users cannot reach the customers module
  });
  const customers = customerData || [];

  const mutation = useMutation({
    mutationFn: (data) =>
      isEditing
        ? bookingsService.updateManual(item._id, data)
        : bookingsService.createManual(data),
    onSuccess: (res) => {
      toast.success(isEditing ? 'Estimated booking updated' : 'Estimated booking created');
      qc.invalidateQueries(['manual-bookings']);
      onSuccess?.(res.data.data);
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  const onSubmit = (data) => {
    // Strip server-only / UI-only fields and coerce types.
    // New booking: round + own POL/POD (the voyage is found by the server). Existing: those are fixed.
    if (!isEditing) {
      const errs = validateRoute(route);
      setRouteErrors(errs);
      if (Object.keys(errs).length) return;
    }
    const payload = {
      ...(isEditing ? {} : { ...route, voyageId: route.voyageId || undefined }),
      agentId:  data.agentId,
      customerId: data.customerId || null,
      remarks:  data.remarks || null,
      ...(isPartnerUser ? {} : { status: data.status, partnerId: data.partnerId || (isEditing ? null : undefined) }),
      cargoRows: data.cargoRows.map(r => ({
        containerTypeId: r.containerTypeId,
        quantity:        Number(r.quantity),
        rate:            r.rate === '' || r.rate == null ? 0 : Number(r.rate),
        dg:              !!r.dg,
        dgValue:         r.dg && r.dgValue ? r.dgValue.trim() : null,
        commodity:       r.commodity?.trim() || null,
        vgm:             r.vgm !== '' && r.vgm != null ? Number(r.vgm) : null,
      })),
    };
    mutation.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

      {/* Locked banner */}
      {isLocked && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          <p className="text-sm text-blue-700">
            {item?.status === 'Final Loading'
              ? 'This booking is on the Final Loading manifest and cannot be edited.'
              : 'Cancelled bookings cannot be edited.'}
          </p>
        </div>
      )}

      {/* ── Round / route ──────────────────────────────────────────── */}
      <SectionCard title="Round / Route">
        {isEditing ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Voyage', val: <span className="mono font-bold text-teal-600">{getVoyageLabel(item?.voyageId) || '—'}</span> },
              { label: 'Direction', val: item?.voyageId?.direction ? `${item.voyageId.direction}bound` : '—' },
              { label: 'POL', val: item?.polId?.name || '—' },
              { label: 'POD', val: item?.podId?.name || '—' },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-[13px] font-medium text-gray-700">{val}</p>
              </div>
            ))}
            <p className="col-span-full text-[11px] text-amber-500">Round, ports and voyage cannot be changed on an existing estimate</p>
          </div>
        ) : (
          <RoundRoutePicker value={route} onChange={setRoute} rounds={rounds} ports={ports} errors={routeErrors} />
        )}
      </SectionCard>

      {/* ── Agent ───────────────────────────────────────────────── */}
      <SectionCard title="Agent">
        <div>
          <FieldLabel required>Agent</FieldLabel>
          <select
            {...register('agentId', { required: 'Agent is required' })}
            disabled={isLocked}
            className={`${ic(errors.agentId)} cursor-pointer`}
          >
            <option value="">Select agent…</option>
            {agents.map(a => (
              <option key={a._id} value={a._id}>
                {a.agentCode ? `${a.agentCode} — ` : ''}{a.agentName}
              </option>
            ))}
          </select>
          {errors.agentId && <p className={ec}>{errors.agentId.message}</p>}
        </div>

        {!isPartnerUser && (
          <div className="mt-4">
            <FieldLabel>Partner (booking given to us by)</FieldLabel>
            <select {...register('partnerId')} disabled={isLocked} className={`${ic(false)} cursor-pointer`}>
              <option value="">No partner</option>
              {partners.map(p => <option key={p._id} value={p._id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
        )}
        {!isPartnerUser && (
          <div className="mt-4">
            <FieldLabel>Customer (optional)</FieldLabel>
            <select {...register('customerId')} disabled={isLocked} className={`${ic(false)} cursor-pointer`}>
              <option value="">No customer selected</option>
              {customers.map(c => (
                <option key={c._id} value={c._id}>{c.customerCode} — {c.customerName} ({c.customerType})</option>
              ))}
            </select>
          </div>
        )}
      </SectionCard>

      {/* ── Cargo Rows ──────────────────────────────────────────── */}
      <SectionCard title="Cargo">
        <div className="flex flex-col gap-3">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[1.8fr_0.6fr_0.8fr_0.5fr_1fr_1fr_0.8fr_auto] gap-2 px-1">
            {[
              { h: 'Container Type', req: true },
              { h: 'Qty', req: true },
              { h: 'Rate ($)', req: false },
              { h: 'DG', req: false },
              { h: 'DG Value', req: false },
              { h: 'Commodity', req: false },
              { h: 'VGM (kg)', req: false },
              { h: '', req: false },
            ].map(({ h, req }) => (
              <p key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {h}{req && <span className="text-red-400 ml-0.5">*</span>}
              </p>
            ))}
          </div>

          {/* Rows */}
          {fields.map((field, index) => {
            const dgOn    = watch(`cargoRows.${index}.dg`);
            const qty     = Number(watch(`cargoRows.${index}.quantity`) || 0);
            const rate    = Number(watch(`cargoRows.${index}.rate`)     || 0);
            const rowTotal = qty * rate;

            return (
              <div key={field.id} className="grid sm:grid-cols-[1.8fr_0.6fr_0.8fr_0.5fr_1fr_1fr_0.8fr_auto] gap-2 items-center bg-white border border-gray-100 rounded-xl px-3 py-3">
                {/* Container Type */}
                <select
                  {...register(`cargoRows.${index}.containerTypeId`, { required: 'Required' })}
                  disabled={isLocked}
                  className={`${ic(errors.cargoRows?.[index]?.containerTypeId)} cursor-pointer text-[12px]`}
                >
                  <option value="">Type…</option>
                  {containerTypes.map(ct => (
                    <option key={ct._id} value={ct._id}>{ct.code} — {ct.size}</option>
                  ))}
                </select>

                {/* Quantity */}
                <input
                  type="number" min="1"
                  {...register(`cargoRows.${index}.quantity`, { required: true, min: 1, valueAsNumber: true })}
                  disabled={isLocked}
                  placeholder="Qty"
                  className={`${ic(errors.cargoRows?.[index]?.quantity)} text-[12px]`}
                />

                {/* Rate */}
                <input
                  type="number" min="0" step="0.01"
                  {...register(`cargoRows.${index}.rate`, { min: 0, valueAsNumber: true })}
                  disabled={isLocked}
                  placeholder="Rate"
                  className={`${ic(errors.cargoRows?.[index]?.rate)} text-[12px]`}
                />

                {/* DG toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !dgOn;
                    setValue(`cargoRows.${index}.dg`, next);
                    if (!next) setValue(`cargoRows.${index}.dgValue`, '');
                  }}
                  disabled={isLocked}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${dgOn ? 'bg-red-500' : 'bg-gray-200'} disabled:opacity-50`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${dgOn ? 'translate-x-6' : 'translate-x-1'}`}/>
                </button>

                {/* DG Value */}
                <input
                  {...register(`cargoRows.${index}.dgValue`)}
                  disabled={isLocked || !dgOn}
                  placeholder={dgOn ? 'e.g. Class 3' : '—'}
                  className={`${ic(false)} text-[12px] ${!dgOn ? 'opacity-40 cursor-not-allowed' : ''}`}
                />

                {/* Commodity */}
                <input
                  {...register(`cargoRows.${index}.commodity`)}
                  disabled={isLocked}
                  placeholder="Commodity"
                  className={`${ic(false)} text-[12px]`}
                />

                {/* VGM */}
                <input
                  type="number" min="0" step="0.01"
                  {...register(`cargoRows.${index}.vgm`)}
                  disabled={isLocked}
                  placeholder="kg"
                  className={`${ic(false)} text-[12px]`}
                />

                {/* Row total + remove */}
                <div className="flex items-center gap-2 justify-end flex-shrink-0">
                  <span className="text-[11px] font-semibold text-teal-700 mono whitespace-nowrap">
                    {fmtMoney(rowTotal)}
                  </span>
                  {!isLocked && fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-red-400 hover:text-red-600 transition flex-shrink-0 ml-1"
                      title="Remove row"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add row button */}
          {!isLocked && (
            <button
              type="button"
              onClick={() => append({ ...EMPTY_ROW })}
              className="flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-800 transition self-start mt-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M12 4v16m8-8H4"/>
              </svg>
              Add Row
            </button>
          )}
        </div>

        {/* Grand total */}
        <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mt-2">
          <div>
            <p className="text-[11px] font-semibold text-teal-600 uppercase tracking-wider">Total Freight</p>
            <p className="text-[11px] text-teal-500 mt-0.5">Sum of all row totals — computed by server on save</p>
          </div>
          <span className="text-xl font-bold text-teal-700 mono">{fmtMoney(grandTotal)}</span>
        </div>
      </SectionCard>

      {/* ── Remarks ─────────────────────────────────────────────── */}
      <div>
        <FieldLabel optional>Remarks</FieldLabel>
        <textarea
          {...register('remarks')}
          rows={2}
          disabled={isLocked}
          placeholder="Optional notes…"
          className={`${ic(false)} resize-none`}
        />
      </div>

      {/* ── Status (edit only) ──────────────────────────────────── */}
      {isEditing && !isPartnerUser && (
        <div>
          <FieldLabel>Status</FieldLabel>
          <select {...register('status')} disabled={isLocked} className={`${ic(false)} cursor-pointer`}>
            {BOOKING_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-md">Cancel</button>
        <button
          type="submit"
          disabled={mutation.isPending || isLocked}
          className="btn btn-primary btn-md flex items-center gap-1.5"
        >
          {mutation.isPending ? (
            <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>Saving…</>
          ) : isEditing ? 'Save Changes' : 'Create Estimated Booking'}
        </button>
      </div>
    </form>
  );
}
