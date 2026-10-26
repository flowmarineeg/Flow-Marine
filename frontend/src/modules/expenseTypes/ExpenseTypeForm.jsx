'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { expenseTypesService } from '@/services/expenseTypes.service';
import { accountsService } from '@/services/accounts.service';
import { OPERATIONAL_LEVELS } from '@/utils/constants';
import { showErrorToast } from '@/utils/errorToast';
import Button from '@/components/ui/Button';

const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ic = (err) =>
  `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition
   ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const ec = 'mt-1 text-[11px] text-red-500';

export default function ExpenseTypeForm({ item = null, onSuccess, onCancel }) {
  const isEdit = !!item;
  const qc     = useQueryClient();

  // ── "Add new category" inline state ────────────────────────────────────────
  const [addingCat,    setAddingCat]    = useState(false);
  const [newCatValue,  setNewCatValue]  = useState('');
  // Sprint 035 — Voyage Profitability cost classification for a new category
  const [newCatClass,  setNewCatClass]  = useState('Other Voyage Cost');
  const newCatInputRef                  = useRef(null);

  // ── RHF ────────────────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    defaultValues: { name: '', category: '', operationalLevel: 'VOYAGE_LEVEL', requiresPda: false, expenseAccountId: '', accrualAccountId: '' },
  });
  const selectedCategory = watch('category');
  const requiresPda = watch('requiresPda');

  const { data: expenseAccounts = [] } = useQuery({ queryKey: ['accounts', 'expense'], queryFn: () => accountsService.lookup('expense').then(r => r.data.data) });
  const { data: accrualAccounts = [] } = useQuery({ queryKey: ['accounts', 'accrual'], queryFn: () => accountsService.lookup('accrual').then(r => r.data.data) });

  // ── Fetch categories ────────────────────────────────────────────────────────
  const { data: categoriesRaw = [] } = useQuery({
    queryKey: ['expense-type-categories'],
    queryFn:  () => expenseTypesService.getCategories().then(r => r.data.data),
    staleTime: 30 * 1000,
  });
  // Always array of { _id, name }
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // ── Populate on edit ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isEdit && item) {
      reset({
        name: item.name, category: item.category,
        operationalLevel: item.operationalLevel || 'VOYAGE_LEVEL', requiresPda: !!item.requiresPda,
        expenseAccountId: item.expenseAccountId?._id || item.expenseAccountId || '',
        accrualAccountId: item.accrualAccountId?._id || item.accrualAccountId || '',
      });
    } else {
      reset({ name: '', category: '', operationalLevel: 'VOYAGE_LEVEL', requiresPda: false, expenseAccountId: '', accrualAccountId: '' });
    }
    setAddingCat(false);
    setNewCatValue('');
  }, [item, isEdit, reset]);

  // ── Focus new category input when it appears ────────────────────────────────
  useEffect(() => {
    if (addingCat) setTimeout(() => newCatInputRef.current?.focus(), 50);
  }, [addingCat]);

  // ── Save new category ───────────────────────────────────────────────────────
  const saveCatMutation = useMutation({
    mutationFn: ({ name, costClassification }) => expenseTypesService.createCategory(name, costClassification),
    onSuccess:  (res) => {
      const created = res.data.data;
      toast.success(`Category "${created.name}" added`);
      qc.invalidateQueries(['expense-type-categories']);
      // Auto-select the newly created category
      setValue('category', created.name, { shouldValidate: true });
      setAddingCat(false);
      setNewCatValue('');
      setNewCatClass('Other Voyage Cost');
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  // ── Sprint 035: toggle an existing category's cost classification ──────────
  const updateCatMutation = useMutation({
    mutationFn: ({ id, costClassification }) => expenseTypesService.updateCategory(id, costClassification),
    onSuccess:  () => {
      qc.invalidateQueries(['expense-type-categories']);
    },
    onError: (e) => showErrorToast(e, 'update'),
  });

  // ── Delete category ─────────────────────────────────────────────────────────
  const deleteCatMutation = useMutation({
    mutationFn: (id) => expenseTypesService.deleteCategory(id),
    onSuccess:  (_, id) => {
      toast.success('Category removed');
      qc.invalidateQueries(['expense-type-categories']);
      // Clear selection if the deleted category was selected
      const deleted = categories.find(c => c._id === id);
      if (deleted && selectedCategory === deleted.name) {
        setValue('category', '', { shouldValidate: false });
      }
    },
    onError: (e) => showErrorToast(e, 'delete'),
  });

  const handleSaveNewCat = () => {
    const trimmed = newCatValue.trim();
    if (!trimmed) { toast.error('Category name cannot be empty'); return; }
    saveCatMutation.mutate({ name: trimmed, costClassification: newCatClass });
  };

  const handleCatKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveNewCat(); }
    if (e.key === 'Escape') { setAddingCat(false); setNewCatValue(''); }
  };

  // ── Submit expense type ─────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, requiresPda: !!data.requiresPda, accrualAccountId: data.requiresPda ? (data.accrualAccountId || null) : null };
      return isEdit ? expenseTypesService.update(item._id, payload) : expenseTypesService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Expense type updated' : 'Expense type created');
      onSuccess?.();
    },
    onError: (e) => showErrorToast(e, 'save'),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col gap-5">

      {/* ── Name ─────────────────────────────────────────────────────── */}
      <div>
        <label className={lc}>
          Expense Type Name <span className="text-red-400">*</span>
        </label>
        <input
          {...register('name', { required: 'Name is required' })}
          placeholder="e.g. Port Dues"
          className={ic(errors.name)}
        />
        {errors.name && <p className={ec}>{errors.name.message}</p>}
      </div>

      {/* ── Category ──────────────────────────────────────────────────── */}
      <div>
        <label className={lc}>
          Category <span className="text-red-400">*</span>
        </label>

        {/* Category dropdown */}
        <div className="relative">
          <select
            {...register('category', { required: 'Category is required' })}
            className={`${ic(errors.category)} cursor-pointer pr-8`}
          >
            <option value="">Select a category…</option>
            {categories.map(c => (
              <option key={c._id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        {errors.category && <p className={ec}>{errors.category.message}</p>}

        {/* Category chips with delete, + "Add new" button */}
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          {categories.map(c => (
            <span
              key={c._id}
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                selectedCategory === c.name
                  ? 'bg-teal-50 border-teal-300 text-teal-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              {/* Click chip to select */}
              <button
                type="button"
                onClick={() => setValue('category', c.name, { shouldValidate: true })}
                className="hover:opacity-70 transition"
              >
                {c.name}
              </button>
              {/* Sprint 035 — click to toggle Voyage Cost / Other Voyage Cost classification */}
              <button
                type="button"
                onClick={() => updateCatMutation.mutate({
                  id: c._id,
                  costClassification: c.costClassification === 'Voyage Cost' ? 'Other Voyage Cost' : 'Voyage Cost',
                })}
                disabled={updateCatMutation.isPending}
                title="Click to toggle Voyage Profitability classification"
                className={`ml-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border transition ${
                  c.costClassification === 'Voyage Cost'
                    ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {c.costClassification === 'Voyage Cost' ? 'Voyage' : 'Other'}
              </button>
              {/* Delete chip */}
              <button
                type="button"
                onClick={() => deleteCatMutation.mutate(c._id)}
                disabled={deleteCatMutation.isPending}
                className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center text-gray-400 hover:text-red-500 transition rounded-full hover:bg-red-50 flex-shrink-0"
                title={`Remove "${c.name}" category`}
              >
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M8 2L2 8M2 2l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </span>
          ))}

          {/* Add new category button / inline input */}
          {!addingCat ? (
            <button
              type="button"
              onClick={() => setAddingCat(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-dashed border-teal-300 text-teal-600 bg-white hover:bg-teal-50 transition"
            >
              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" d="M12 5v14M5 12h14"/>
              </svg>
              Add type
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                ref={newCatInputRef}
                value={newCatValue}
                onChange={e => setNewCatValue(e.target.value)}
                onKeyDown={handleCatKeyDown}
                maxLength={50}
                placeholder="New category name…"
                className="text-[12px] border border-teal-400 rounded-lg px-2.5 py-1 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 w-40"
              />
              {/* Sprint 035 — classification for the new category */}
              <select
                value={newCatClass}
                onChange={e => setNewCatClass(e.target.value)}
                title="Voyage Profitability classification"
                className="text-[11px] border border-teal-400 rounded-lg px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="Other Voyage Cost">Other</option>
                <option value="Voyage Cost">Voyage</option>
              </select>
              <button
                type="button"
                onClick={handleSaveNewCat}
                disabled={saveCatMutation.isPending || !newCatValue.trim()}
                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-600 text-white hover:bg-teal-700 transition disabled:opacity-50"
                title="Save category"
              >
                {saveCatMutation.isPending ? (
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : (
                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" d="M5 13l4 4L19 7"/>
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setAddingCat(false); setNewCatValue(''); }}
                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition"
                title="Cancel"
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        <p className="mt-2 text-[10px] text-gray-400">
          Click a category chip to select it · Click the Voyage/Other badge to toggle its Voyage Profitability
          classification · Click ✕ on a chip to remove that category · Press Enter to save a new one
        </p>
      </div>

      {/* ── Classification & accounting (master data 11.7) ────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col gap-3">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Cost classification & accounting</p>
        <div>
          <label className={lc}>Operational Level <span className="text-red-400">*</span></label>
          <select {...register('operationalLevel', { required: true })} className={ic(false)}>
            {OPERATIONAL_LEVELS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lc}>Expense Account <span className="text-red-400">*</span></label>
          <select {...register('expenseAccountId', { required: 'Expense account is required' })} className={ic(errors.expenseAccountId)}>
            <option value="">Select expense account…</option>
            {expenseAccounts.map(a => <option key={a._id} value={a._id}>{a.code} — {a.name}</option>)}
          </select>
          {errors.expenseAccountId && <p className={ec}>{errors.expenseAccountId.message}</p>}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
          <input type="checkbox" {...register('requiresPda')} className="accent-teal-600" />
          Requires PDA <span className="text-gray-400 text-[12px]">(starts as a provisional estimate, final entered later)</span>
        </label>
        {requiresPda && (
          <div>
            <label className={lc}>Accrual Account <span className="text-red-400">*</span></label>
            <select {...register('accrualAccountId', { validate: (v) => !!v || 'Accrual account is required when PDA is enabled' })} className={ic(errors.accrualAccountId)}>
              <option value="">Select accrual account…</option>
              {accrualAccounts.map(a => <option key={a._id} value={a._id}>{a.code} — {a.name}</option>)}
            </select>
            {errors.accrualAccountId && <p className={ec}>{errors.accrualAccountId.message}</p>}
          </div>
        )}
        <p className="text-[11px] text-gray-400">The expense type never stores an amount: the estimate is entered in the PDA workflow, the actual in Expenses.</p>
      </div>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={mutation.isPending}>
          {isEdit ? 'Save Changes' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
