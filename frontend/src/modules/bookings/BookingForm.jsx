'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { bookingsService }       from '@/services/bookings.service';
import { voyagesService }        from '@/services/voyages.service';
import { agentsService }         from '@/services/agents.service';
import { containerTypesService } from '@/services/containerTypes.service';
import { BOOKING_STATUS }        from '@/utils/constants';

const fmt      = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

const ic = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800
   focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ec = 'mt-1 text-[11px] text-red-500';

function FieldLabel({ children, required, optional }) {
  return (
    <label className={lc}>
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
      {optional && <span className="ml-1.5 text-gray-300 font-normal normal-case text-[10px]">(optional)</span>}
    </label>
  );
}

const SectionCard = ({ title, children }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{title}</p>
    {children}
  </div>
);

export default function BookingForm({ item, onSuccess, onCancel }) {
  const qc        = useQueryClient();
  const isEditing = !!item;
  const isLocked  = ['Cancelled', 'Final Loading'].includes(item?.status);
  const [capacityWarning, setCapacityWarning] = useState(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    defaultValues: {
      voyageId:        item?.voyageId?._id       || item?.voyageId       || '',
      agentId:         item?.agentId?._id        || item?.agentId        || '',
      shipper:         item?.shipper             || '',
      consignee:       item?.consignee           || '',
      carrierName:     item?.carrierName         || '',
      polId:           item?.polId?._id          || item?.polId          || '',
      podId:           item?.podId?._id          || item?.podId          || '',
      containerTypeId: item?.containerTypeId?._id || item?.containerTypeId || '',
      quantity:        item?.quantity            || 1,
      freightRate:     item?.freightRate         || 0,
      commodity:       item?.commodity           || '',
      containerNumber: item?.containerNumber     || '',
      vgm:             item?.vgm                ?? '',
      dg:              item?.dg                  ?? false,
      dgPercent:       item?.dgPercent           ?? '',
      containerStatus: item?.containerStatus     || '',
      remarks:         item?.remarks             || '',
      status:          item?.status              || 'Pending',
    },
  });

  const watchedVoyageId = watch('voyageId');
  const watchedQuantity = watch('quantity');
  const watchedFreight  = watch('freightRate');
  const watchedDg       = watch('dg');
  const liveTotal       = useMemo(
    () => (Number(watchedQuantity) || 0) * (Number(watchedFreight) || 0),
    [watchedQuantity, watchedFreight]
  );

  // Voyages dropdown (non-cancelled, non-completed)
  const { data: voyageData } = useQuery({
    queryKey: ['voyages-dropdown'],
    queryFn:  () => voyagesService.list({ limit: 200 }).then(r => r.data.data),
  });
  const voyages = (voyageData || []).filter(v => !['Cancelled', 'Completed'].includes(v.status));
  const selectedVoyage = voyages.find(v => v._id === watchedVoyageId);

  // Voyage ports for POL/POD
  const { data: voyagePorts = [] } = useQuery({
    queryKey: ['voyage-ports', watchedVoyageId],
    queryFn:  () => bookingsService.getVoyagePorts(watchedVoyageId).then(r => r.data.data),
    enabled:  !!watchedVoyageId,
  });

  useEffect(() => {
    if (!isEditing && watchedVoyageId) {
      setValue('polId', '');
      setValue('podId', '');
    }
  }, [watchedVoyageId, isEditing, setValue]);

  // Agents
  const { data: agentData } = useQuery({
    queryKey: ['agents-dropdown'],
    queryFn:  () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
  });
  const agents = agentData || [];

  // Container types
  const { data: ctData } = useQuery({
    queryKey: ['container-types-dropdown'],
    queryFn:  () => containerTypesService.list({ limit: 200 }).then(r => r.data.data),
  });
  const containerTypes = ctData || [];

  const mutation = useMutation({
    mutationFn: (data) =>
      isEditing
        ? bookingsService.update(item._id, data)
        : bookingsService.create(data),
    onSuccess: (res) => {
      toast.success(isEditing ? 'Booking updated' : 'Booking created');
      qc.invalidateQueries(['bookings']);
      // Sprint 022: server attaches _capacityWarning if enforcement=warn and segment overbooked
      const warn = res.data.data?._capacityWarning;
      if (warn) {
        setCapacityWarning(warn);
        // Do not call onSuccess yet — let user see the warning first
      } else {
        onSuccess?.(res.data.data);
      }
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Save failed'),
  });

  const onSubmit = (data) => {
    setCapacityWarning(null);
    const { totalFreight: _ignored, ...payload } = data;
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

      {/* Capacity warning banner (Sprint 022 — warn mode) */}
      {capacityWarning && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            <div className="flex-1">
              <p className="text-[12px] font-bold text-amber-700 mb-1">Capacity Warning</p>
              <p className="text-[12px] text-amber-700">
                Booking was saved but it exceeds vessel capacity on segment {capacityWarning.bottleneckSegment?.segmentIndex}.
                Added <strong>{capacityWarning.addedTEU} TEU</strong>; remaining after this booking:{' '}
                <strong className="text-red-600">{capacityWarning.bottleneckSegment?.remainingAfterAdd} TEU</strong>.
              </p>
              <p className="text-[11px] text-amber-600 mt-1">
                Contact your operations team to review vessel capacity for this round.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setCapacityWarning(null); onSuccess?.(); }}
              className="text-amber-600 hover:text-amber-800 text-xs font-semibold flex-shrink-0"
            >
              OK, close
            </button>
          </div>
        </div>
      )}

      {/* ── Voyage ─────────────────────────────────────────────────── */}
      <SectionCard title="Voyage">
        <div>
          <FieldLabel required>Voyage</FieldLabel>
          <select
            {...register('voyageId', { required: 'Voyage is required' })}
            disabled={isEditing || isLocked}
            className={`${ic(errors.voyageId)} ${isEditing ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <option value="">Select voyage…</option>
            {voyages.map(v => (
              <option key={v._id} value={v._id}>
                {v.voyageNumber} — {v.polId?.name ?? '?'} → {v.podId?.name ?? '?'}
              </option>
            ))}
          </select>
          {errors.voyageId && <p className={ec}>{errors.voyageId.message}</p>}
          {isEditing && <p className="mt-1 text-[11px] text-amber-500">Voyage cannot be changed on an existing booking</p>}
        </div>

        {selectedVoyage && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Voyage No', val: <span className="mono font-bold text-teal-600">{selectedVoyage.voyageNumber}</span> },
              { label: 'Status',    val: selectedVoyage.status },
              { label: 'ETD',       val: fmt(selectedVoyage.etd) },
              { label: 'ETA',       val: fmt(selectedVoyage.eta) },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-[13px] font-medium text-gray-700">{val}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Parties ────────────────────────────────────────────────── */}
      <SectionCard title="Parties">
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

        {/* Carrier Name — new Sprint 017 */}
        <div>
          <FieldLabel optional>Carrier Name</FieldLabel>
          <input
            {...register('carrierName')}
            placeholder="e.g. MSC, Maersk, COSCO"
            disabled={isLocked}
            className={ic(false)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            {/* Shipper is now optional */}
            <FieldLabel optional>Shipper</FieldLabel>
            <input
              {...register('shipper')}
              placeholder="Shipper company name"
              disabled={isLocked}
              className={ic(false)}
            />
          </div>
          <div>
            {/* Consignee is now optional */}
            <FieldLabel optional>Consignee</FieldLabel>
            <input
              {...register('consignee')}
              placeholder="Consignee company name"
              disabled={isLocked}
              className={ic(false)}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Ports ──────────────────────────────────────────────────── */}
      <SectionCard title="Port of Loading / Discharge">
        {!watchedVoyageId && (
          <p className="text-xs text-gray-400 italic">Select a voyage first to load available ports.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel required>POL (Port of Loading)</FieldLabel>
            <select
              {...register('polId', { required: 'POL is required' })}
              disabled={!watchedVoyageId || isLocked}
              className={`${ic(errors.polId)} cursor-pointer disabled:opacity-50`}
            >
              <option value="">Select POL…</option>
              {voyagePorts.map(p => (
                <option key={p._id} value={p._id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
              ))}
            </select>
            {errors.polId && <p className={ec}>{errors.polId.message}</p>}
          </div>
          <div>
            <FieldLabel required>POD (Port of Discharge)</FieldLabel>
            <select
              {...register('podId', { required: 'POD is required' })}
              disabled={!watchedVoyageId || isLocked}
              className={`${ic(errors.podId)} cursor-pointer disabled:opacity-50`}
            >
              <option value="">Select POD…</option>
              {voyagePorts.map(p => (
                <option key={p._id} value={p._id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
              ))}
            </select>
            {errors.podId && <p className={ec}>{errors.podId.message}</p>}
          </div>
        </div>
      </SectionCard>

      {/* ── Cargo & Freight ────────────────────────────────────────── */}
      <SectionCard title="Cargo & Freight">
        <div>
          <FieldLabel required>Container Type</FieldLabel>
          <select
            {...register('containerTypeId', { required: 'Container type is required' })}
            disabled={isLocked}
            className={`${ic(errors.containerTypeId)} cursor-pointer`}
          >
            <option value="">Select container type…</option>
            {containerTypes.map(ct => (
              <option key={ct._id} value={ct._id}>{ct.code} — {ct.size} {ct.type}</option>
            ))}
          </select>
          {errors.containerTypeId && <p className={ec}>{errors.containerTypeId.message}</p>}
        </div>

        {/* 2-column grid: Quantity | Freight Rate (slotCount removed) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel required>Quantity</FieldLabel>
            <input
              type="number" min="1"
              {...register('quantity', {
                required: 'Required',
                min: { value: 1, message: 'Min 1' },
                valueAsNumber: true,
              })}
              disabled={isLocked}
              className={ic(errors.quantity)}
            />
            {errors.quantity && <p className={ec}>{errors.quantity.message}</p>}
          </div>
          <div>
            <FieldLabel required>Freight Rate ($)</FieldLabel>
            <input
              type="number" min="0" step="0.01"
              {...register('freightRate', {
                required: 'Required',
                min: { value: 0, message: 'Min 0' },
                valueAsNumber: true,
              })}
              disabled={isLocked}
              className={ic(errors.freightRate)}
            />
            {errors.freightRate && <p className={ec}>{errors.freightRate.message}</p>}
          </div>
        </div>

        {/* Live total */}
        <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold text-teal-600 uppercase tracking-wider">Total Freight</p>
            <p className="text-[11px] text-teal-500 mt-0.5">Qty × Rate — computed by server on save</p>
          </div>
          <span className="text-xl font-bold text-teal-700 mono">{fmtMoney(liveTotal)}</span>
        </div>

        <div>
          <FieldLabel optional>Commodity</FieldLabel>
          <input
            {...register('commodity')}
            placeholder="e.g. Electronics, Textiles…"
            disabled={isLocked}
            className={ic(false)}
          />
        </div>

        {/* Container Number — required, primary ref */}
        <div>
          <FieldLabel required>Container Number</FieldLabel>
          <input
            {...register('containerNumber', { required: 'Container number is required' })}
            placeholder="e.g. MSCU1234567"
            disabled={isLocked}
            className={`${ic(errors.containerNumber)} uppercase`}
          />
          {errors.containerNumber && <p className={ec}>{errors.containerNumber.message}</p>}
        </div>

        {/* VGM + Container Status in a row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel optional>VGM (kg)</FieldLabel>
            <input
              type="number" min="0" step="0.01"
              {...register('vgm', { min: { value: 0, message: 'Min 0' } })}
              placeholder="Verified Gross Mass in kg"
              disabled={isLocked}
              className={ic(errors.vgm)}
            />
            {errors.vgm && <p className={ec}>{errors.vgm.message}</p>}
          </div>
          <div>
            <FieldLabel optional>Container Status</FieldLabel>
            <select
              {...register('containerStatus')}
              disabled={isLocked}
              className={`${ic(false)} cursor-pointer`}
            >
              <option value="">Select status…</option>
              {['Full', 'Empty'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* DG toggle */}
        <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-semibold text-gray-700">Dangerous Goods (DG)</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Does this shipment contain dangerous goods?</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !watchedDg;
                setValue('dg', next, { shouldValidate: true });
                if (!next) setValue('dgPercent', '');
              }}
              disabled={isLocked}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                watchedDg ? 'bg-red-500' : 'bg-gray-200'
              } disabled:opacity-50`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                watchedDg ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
          </div>

          {watchedDg && (
            <div>
              <FieldLabel>DG Percentage (0–100%)</FieldLabel>
              <div className="flex items-center gap-3">
                <input
                  type="number" min="0" max="100" step="1"
                  {...register('dgPercent', {
                    min: { value: 0,   message: 'Min 0%' },
                    max: { value: 100, message: 'Max 100%' },
                  })}
                  placeholder="e.g. 25"
                  disabled={isLocked}
                  className={`${ic(errors.dgPercent)} max-w-[160px]`}
                />
                <span className="text-sm font-semibold text-red-500">%</span>
              </div>
              {errors.dgPercent && <p className={ec}>{errors.dgPercent.message}</p>}
            </div>
          )}
        </div>

        <div>
          <FieldLabel optional>Remarks</FieldLabel>
          <textarea
            {...register('remarks')}
            rows={3}
            placeholder="Optional notes…"
            disabled={isLocked}
            className={`${ic(false)} resize-none`}
          />
        </div>
      </SectionCard>

      {/* ── Status (edit only) ─────────────────────────────────────── */}
      {isEditing && (
        <div>
          <FieldLabel>Status</FieldLabel>
          <select
            {...register('status')}
            disabled={isLocked}
            className={`${ic(false)} cursor-pointer`}
          >
            {BOOKING_STATUS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Actions ────────────────────────────────────────────────── */}
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
          ) : isEditing ? 'Save Changes' : 'Create Booking'}
        </button>
      </div>
    </form>
  );
}
