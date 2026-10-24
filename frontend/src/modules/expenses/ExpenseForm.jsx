'use client';

import { useRef, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { expensesService }    from '@/services/expenses.service';
import { expenseTypesService } from '@/services/expenseTypes.service';
import { agentsService }       from '@/services/agents.service';
import { roundsService }       from '@/services/rounds.service';
import { voyagesService }      from '@/services/voyages.service';
import { getVoyageLabel } from '@/utils/voyageLabel';
import { partnersService } from '@/services/partners.service';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';

const ic = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const lc  = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ec  = 'mt-1 text-[11px] text-red-500';

export default function ExpenseForm({ item }) {
  const router     = useRouter();
  const qc         = useQueryClient();
  const isEditing  = !!item;
  const fileRef    = useRef(null);
  // Sprint 036 — three-way scope: Round / Voyage / Port. There is no
  // `scope` field sent to the API (it's always inferred server-side from
  // roundId/voyageId/portId) — linkType is purely local UI state that
  // decides which of those three IDs this form submits.
  const [linkType, setLinkType] = useState(item?.portId ? 'port' : item?.voyageId ? 'voyage' : 'round');
  // Cascade state for Voyage/Port link types (Decisions 5/6: Round → Voyage[ → Port]).
  // Preselected from the existing voyage's own roundId on edit, same
  // pattern as BookingForm.jsx (Sprint 030).
  const [cascadeRoundId, setCascadeRoundId] = useState(item?.voyageId?.roundId?._id || item?.voyageId?.roundId || '');
  const [fileError, setFileError] = useState('');

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm({
    defaultValues: {
      roundId:       item?.roundId?._id   || item?.roundId   || '',
      voyageId:      item?.voyageId?._id  || item?.voyageId  || '',
      portId:        item?.portId?._id    || item?.portId    || '',
      expenseTypeId: item?.expenseTypeId?._id || item?.expenseTypeId || '',
      agentId:       item?.agentId?._id   || item?.agentId   || '',
      port:          item?.port           || '',
      amount:        item?.amount         || '',
      currency:      item?.currency       || 'USD',
      expenseDate:   item?.expenseDate    ? item.expenseDate.slice(0, 10) : '',
      description:   item?.description   || '',
      kind:          item?.kind          || 'FDA',
      paidBy:        item?.paidBy        || '',
      paidByPartnerId: item?.paidByPartnerId?._id || item?.paidByPartnerId || '',
    },
  });
  const selectedVoyageId = watch('voyageId');
  const watchedPaidBy = watch('paidBy');
  const { data: partnerList = [] } = useQuery({
    queryKey: ['partners-dropdown'],
    queryFn: () => partnersService.list({ limit: 100, status: 'Active' }).then(r => r.data.data),
    enabled: watchedPaidBy === 'Partner',
  });
  const postedLocked = !!item?.ledgerEntryId;

  /* ── Dropdown data ───────────────────────────────────────────────────────── */
  const { data: etData }  = useQuery({ queryKey: ['expense-types-dd'], queryFn: () => expenseTypesService.list({ limit: 200 }).then(r => r.data.data) });
  const { data: agData }  = useQuery({ queryKey: ['agents-dd'],        queryFn: () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data) });
  const { data: rdData }  = useQuery({ queryKey: ['rounds-dd'],        queryFn: () => roundsService.list({ limit: 200 }).then(r => r.data.data) });
  // Voyage dropdown cascades from cascadeRoundId when linking to Voyage/Port
  // (Sprint 036 Decisions 5/6) — reuses the same populated polId/podId
  // voyagesService.list() already returns, so a Port dropdown can be built
  // client-side with no new endpoint (ADR-3).
  const { data: vgData }  = useQuery({
    queryKey: ['voyages-dd', cascadeRoundId],
    queryFn:  () => voyagesService.list({ roundId: cascadeRoundId, limit: 200 }).then(r => r.data.data),
    enabled:  linkType !== 'round' && !!cascadeRoundId,
  });

  // Reset the selected Port whenever the Voyage changes (skip the very
  // first render so an existing item's portId survives on edit).
  const voyageMounted = useRef(false);
  useEffect(() => {
    if (!voyageMounted.current) { voyageMounted.current = true; return; }
    setValue('portId', '');
  }, [selectedVoyageId, setValue]);

  const expenseTypes = etData?.data || etData || [];
  const agents       = agData?.data || agData || [];
  const rounds       = rdData?.data || rdData || [];
  const voyages      = vgData?.data || vgData || [];
  const selectedVoyage = voyages.find(v => v._id === selectedVoyageId);
  // Sprint 036 Decision 6 — Port options are exactly the selected voyage's
  // own POL and POD (current schema limitation: a Voyage has only two
  // ports — see sprints/036-sprint.txt Business Validation section 6).
  const voyagePortOptions = selectedVoyage
    ? [selectedVoyage.polId, selectedVoyage.podId].filter(Boolean)
    : [];

  /* ── File validation ─────────────────────────────────────────────────────── */
  const validateFile = (file) => {
    if (!file) return true;
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) { setFileError('Only JPEG, PNG, or PDF allowed'); return false; }
    if (file.size > 10 * 1024 * 1024) { setFileError('File must be under 10 MB'); return false; }
    setFileError('');
    return true;
  };

  /* ── Submit ──────────────────────────────────────────────────────────────── */
  const mutation = useMutation({
    mutationFn: (fd) =>
      isEditing ? expensesService.update(item._id, fd) : expensesService.create(fd),
    onSuccess: () => {
      toast.success(isEditing ? 'Expense updated' : 'Expense created');
      qc.invalidateQueries(['expenses']);
      router.push('/expenses');
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  const onSubmit = (data) => {
    const file = fileRef.current?.files?.[0];
    if (file && !validateFile(file)) return;

    const fd = new FormData();
    // Link type — no `scope` field is ever sent; the server infers scope
    // from whichever of roundId/voyageId/portId are present (Sprint 036 ADR-2).
    if (linkType === 'round')  { fd.append('roundId', data.roundId || ''); fd.append('voyageId', ''); fd.append('portId', ''); }
    if (linkType === 'voyage') { fd.append('voyageId', data.voyageId || ''); fd.append('roundId', ''); fd.append('portId', ''); }
    if (linkType === 'port')   { fd.append('voyageId', data.voyageId || ''); fd.append('portId', data.portId || ''); fd.append('roundId', ''); }

    fd.append('expenseTypeId', data.expenseTypeId);
    fd.append('agentId',       data.agentId       || '');
    fd.append('port',          data.port          || '');
    fd.append('amount',        data.amount);
    fd.append('currency',      data.currency.toUpperCase());
    fd.append('expenseDate',   data.expenseDate);
    fd.append('description',   data.description   || '');
    {
      fd.append('kind', data.kind || 'FDA');
      if (!postedLocked) {
        fd.append('paidBy', data.paidBy || '');
        fd.append('paidByPartnerId', data.paidBy === 'Partner' ? (data.paidByPartnerId || '') : '');
      }
    }
    if (file) fd.append('attachment', file);

    mutation.mutate(fd);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

      {/* ── Link type toggle ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Link To</p>
        <div className="flex gap-2">
          {['round', 'voyage', 'port'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setLinkType(t);
                setValue('portId', '');
                if (t !== 'voyage' && t !== 'port') setValue('voyageId', '');
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                linkType === t
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400'
              }`}
            >
              {t === 'round' ? '🔄 Round' : t === 'voyage' ? '🚢 Voyage' : '⚓ Port'}
            </button>
          ))}
        </div>

        {linkType === 'round' && (
          <div>
            <label className={lc}>Round <span className="text-red-400">*</span></label>
            <select {...register('roundId', { required: linkType === 'round' ? 'Round is required' : false })} className={`${ic(errors.roundId)} cursor-pointer`}>
              <option value="">Select round…</option>
              {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
            </select>
            {errors.roundId && <p className={ec}>{errors.roundId.message}</p>}
          </div>
        )}

        {(linkType === 'voyage' || linkType === 'port') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>Round <span className="text-red-400">*</span></label>
              <select
                value={cascadeRoundId}
                onChange={e => { setCascadeRoundId(e.target.value); setValue('voyageId', ''); setValue('portId', ''); }}
                className={`${ic(!cascadeRoundId)} cursor-pointer`}
              >
                <option value="">Select round…</option>
                {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
              </select>
              {!cascadeRoundId && <p className={ec}>Select a Round to narrow the Voyage list</p>}
            </div>
            <div>
              <label className={lc}>Voyage <span className="text-red-400">*</span></label>
              <select
                {...register('voyageId', { required: 'Voyage is required' })}
                disabled={!cascadeRoundId}
                className={`${ic(errors.voyageId)} cursor-pointer disabled:opacity-50`}
              >
                <option value="">Select voyage…</option>
                {voyages.map(v => <option key={v._id} value={v._id}>{getVoyageLabel(v)}</option>)}
              </select>
              {errors.voyageId && <p className={ec}>{errors.voyageId.message}</p>}
            </div>
          </div>
        )}

        {linkType === 'port' && (
          <div>
            <label className={lc}>Port <span className="text-red-400">*</span></label>
            <select
              {...register('portId', { required: linkType === 'port' ? 'Port is required' : false })}
              disabled={!selectedVoyageId}
              className={`${ic(errors.portId)} cursor-pointer disabled:opacity-50`}
            >
              <option value="">Select port…</option>
              {voyagePortOptions.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            {errors.portId && <p className={ec}>{errors.portId.message}</p>}
            <p className="mt-1.5 text-[10px] text-gray-400">
              Only this voyage&apos;s own POL/POD are selectable (current schema limitation — a voyage models a single leg).
            </p>
          </div>
        )}
      </div>

      {/* ── Expense details ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Expense Details</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lc}>Expense Type <span className="text-red-400">*</span></label>
            <select {...register('expenseTypeId', { required: 'Expense type is required' })} className={`${ic(errors.expenseTypeId)} cursor-pointer`}>
              <option value="">Select type…</option>
              {expenseTypes.map(et => (
                <option key={et._id} value={et._id}>{et.name} ({et.category})</option>
              ))}
            </select>
            {errors.expenseTypeId && <p className={ec}>{errors.expenseTypeId.message}</p>}
          </div>
          <div>
            <label className={lc}>Agent</label>
            <select {...register('agentId')} className={`${ic(false)} cursor-pointer`}>
              <option value="">No agent</option>
              {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode} — {a.agentName}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={lc}>Amount <span className="text-red-400">*</span></label>
            <input
              type="number" min="0" step="0.01"
              {...register('amount', { required: 'Amount is required', min: { value: 0, message: 'Min 0' } })}
              className={ic(errors.amount)}
            />
            {errors.amount && <p className={ec}>{errors.amount.message}</p>}
          </div>
          <div>
            <label className={lc}>Currency <span className="text-red-400">*</span></label>
            <input
              {...register('currency', { required: 'Currency is required' })}
              placeholder="USD"
              className={`${ic(errors.currency)} uppercase`}
            />
            {errors.currency && <p className={ec}>{errors.currency.message}</p>}
          </div>
          <div>
            <label className={lc}>Expense Date <span className="text-red-400">*</span></label>
            <input
              type="date" max={today}
              {...register('expenseDate', { required: 'Date is required' })}
              className={ic(errors.expenseDate)}
            />
            {errors.expenseDate && <p className={ec}>{errors.expenseDate.message}</p>}
          </div>
        </div>

        {linkType !== 'port' && (
          <div>
            <label className={lc}>Port (free text, legacy)</label>
            <input {...register('port')} placeholder="Port name (optional)" className={ic(false)} />
            <p className="mt-1 text-[10px] text-gray-400">
              For structured, reportable per-port costing use the &quot;⚓ Port&quot; link type above instead.
            </p>
          </div>
        )}

        {/* Sprint 052 V2 - estimate vs final, and who paid */}
        {(
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 grid grid-cols-3 gap-3">
            {postedLocked && <p className="col-span-3 text-[11px] text-amber-700">Posted to the ledger - amount, type, agent, date and paid-by are locked. Reverse it from the Expenses list to change them.</p>}
            <div>
              <label className={lc}>Kind</label>
              <select {...register('kind')} disabled={!!item?.pdaExpenseId || postedLocked} className={`${ic(false)} cursor-pointer`}>
                <option value="FDA">Final (FDA)</option>
                <option value="PDA">Estimate (PDA)</option>
              </select>
            </div>
            <div>
              <label className={lc}>Paid by</label>
              <select {...register('paidBy')} disabled={postedLocked} className={`${ic(false)} cursor-pointer`}>
                <option value="">Not set</option>
                <option value="PortAgent">Port agent (we owe them)</option>
                <option value="Company">Company</option>
                <option value="Partner">A partner directly</option>
              </select>
            </div>
            {watchedPaidBy === 'Partner' && (
              <div>
                <label className={lc}>Partner</label>
                <select {...register('paidByPartnerId')} disabled={postedLocked} className={`${ic(false)} cursor-pointer`}>
                  <option value="">Select partner...</option>
                  {partnerList.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div>
          <label className={lc}>Description</label>
          <textarea {...register('description')} rows={3} placeholder="Additional notes…" className={`${ic(false)} resize-none`} />
        </div>
      </div>

      {/* ── Attachment ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-3">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Attachment</p>

        {isEditing && item?.attachmentUrl && (
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-teal-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
            </svg>
            <a
              href={`${API_BASE}${item.attachmentUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-600 hover:underline truncate"
            >
              {item.attachmentOriginalName || 'Current attachment'}
            </a>
            <span className="text-gray-400 text-xs">(uploading a new file will replace this)</span>
          </div>
        )}

        <div>
          <label className={lc}>
            {isEditing ? 'Replace Attachment' : 'Attachment'}
            <span className="text-gray-300 font-normal ml-1">(PDF or image, max 10 MB)</span>
          </label>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            ref={fileRef}
            onChange={(e) => validateFile(e.target.files?.[0])}
            className="w-full text-[13px] text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 transition cursor-pointer"
          />
          {fileError && <p className={ec}>{fileError}</p>}
        </div>
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => router.push('/expenses')} className="btn btn-secondary btn-md">
          Cancel
        </button>
        <button type="submit" disabled={mutation.isPending} className="btn btn-primary btn-md flex items-center gap-1.5">
          {mutation.isPending ? (
            <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving…</>
          ) : isEditing ? 'Save Changes' : 'Create Expense'}
        </button>
      </div>
    </form>
  );
}
