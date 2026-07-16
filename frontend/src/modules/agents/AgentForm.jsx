'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { agentsService } from '@/services/agents.service';
import { AGENT_STATUS } from '@/utils/constants';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PageHeader from '@/components/ui/PageHeader';

const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
const ic = (err) => `w-full text-[13px] border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 transition ${err ? 'border-red-400 focus:ring-red-400/20' : 'border-gray-200 focus:border-teal-500 focus:ring-teal-500/10'}`;
const ec = 'mt-1 text-[11px] text-red-500';

const SectionCard = ({ title, children }) => (
  <div className="card p-6 mb-4">
    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">{title}</p>
    {children}
  </div>
);

const emptyContact = () => ({ contactPerson: '', mobile: '', email: '', description: '' });

export default function AgentForm({ id = null }) {
  const router = useRouter();
  const isEdit = !!id;

  const { data: agentData, isLoading } = useQuery({
    queryKey: ['agent', id],
    queryFn:  () => agentsService.getById(id).then(r => r.data.data),
    enabled:  isEdit,
  });

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { agentCode: '', agentName: '', country: '', city: '', port: '', address: '', status: 'Active', contacts: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'contacts' });

  useEffect(() => {
    if (isEdit && agentData) {
      reset({
        agentCode: agentData.agentCode || '',
        agentName: agentData.agentName,
        country:   agentData.country   || '',
        city:      agentData.city      || '',
        port:      agentData.port      || '',
        address:   agentData.address   || '',
        status:    agentData.status,
        contacts:  agentData.contacts?.length > 0 ? agentData.contacts : [],
      });
    }
  }, [agentData, isEdit, reset]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        agentCode: data.agentCode?.trim() || null,
        contacts: data.contacts || [],
      };
      return isEdit ? agentsService.update(id, payload) : agentsService.create(payload);
    },
    onSuccess: () => { toast.success(isEdit ? 'Agent updated' : 'Agent created'); router.push('/agents'); },
    onError:   (e) => toast.error(e.response?.data?.message || 'Operation failed'),
  });

  if (isEdit && isLoading) return <LoadingSpinner fullPage />;

  return (
    <div className="animate-fadeIn max-w-3xl">
      <PageHeader
        title={isEdit ? 'Edit Agent' : 'New Agent'}
        subtitle={isEdit ? `Editing: ${agentData?.agentName || '…'}` : 'Register a new shipping agent'}
        action={<Button variant="secondary" onClick={() => router.push('/agents')}>← Back</Button>}
      />

      <form onSubmit={handleSubmit(d => mutation.mutate(d))}>

        {/* ── Identity ─────────────────────────────────────────────────── */}
        <SectionCard title="Agent Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>
                Agent Code
                <span className="ml-1.5 text-gray-300 font-normal normal-case text-[10px]">(optional)</span>
              </label>
              <input
                {...register('agentCode')}
                placeholder="e.g. AGT-UAE (leave blank if none)"
                className={`${ic(false)} uppercase`}
              />
            </div>
            <div>
              <label className={lc}>Agent Name <span className="text-red-400">*</span></label>
              <input
                {...register('agentName', { required: 'Agent name is required' })}
                placeholder="e.g. Gulf Maritime Agency"
                className={ic(errors.agentName)}
              />
              {errors.agentName && <p className={ec}>{errors.agentName.message}</p>}
            </div>
          </div>
        </SectionCard>

        {/* ── Location ─────────────────────────────────────────────────── */}
        <SectionCard title="Location">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={lc}>Country</label>
              <input {...register('country')} placeholder="e.g. UAE" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>City</label>
              <input {...register('city')} placeholder="e.g. Dubai" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Port</label>
              <input {...register('port')} placeholder="e.g. Jebel Ali" className={ic(false)} />
            </div>
          </div>
          <div>
            <label className={lc}>Full Address</label>
            <input {...register('address')} placeholder="Street, building, area…" className={ic(false)} />
          </div>
        </SectionCard>

        {/* ── Contact Information ──────────────────────────────────────── */}
        <SectionCard title="Contact Information">
          {fields.length === 0 && (
            <p className="text-xs text-gray-400 italic mb-4">No contacts added yet. Click the button below to add one.</p>
          )}

          <div className="flex flex-col gap-3 mb-4">
            {fields.map((field, idx) => (
              <div key={field.id}
                className="relative bg-gray-50 border border-gray-200 rounded-xl p-4 hover:border-teal-200 transition group">

                {/* Row number badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                    Contact #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 transition font-medium"
                  >
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={lc}>Contact Person</label>
                    <input
                      {...register(`contacts.${idx}.contactPerson`)}
                      placeholder="e.g. Ahmed Al-Mansoori"
                      className={ic(false)}
                    />
                  </div>
                  <div>
                    <label className={lc}>Mobile</label>
                    <input
                      {...register(`contacts.${idx}.mobile`)}
                      placeholder="e.g. +971 50 123 4567"
                      className={ic(false)}
                    />
                  </div>
                  <div>
                    <label className={lc}>Email</label>
                    <input
                      type="email"
                      {...register(`contacts.${idx}.email`)}
                      placeholder="e.g. ahmed@agency.ae"
                      className={ic(errors.contacts?.[idx]?.email)}
                    />
                    {errors.contacts?.[idx]?.email && (
                      <p className={ec}>{errors.contacts[idx].email.message}</p>
                    )}
                  </div>
                  <div>
                    <label className={lc}>Role / Description</label>
                    <input
                      {...register(`contacts.${idx}.description`)}
                      placeholder="e.g. Operations Manager"
                      className={ic(false)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => append(emptyContact())}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-all"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" d="M12 5v14M5 12h14"/>
            </svg>
            Add Contact
          </button>
        </SectionCard>

        {/* ── Status ───────────────────────────────────────────────────── */}
        <SectionCard title="Status">
          <div style={{ maxWidth: 200 }}>
            <label className={lc}>Status</label>
            <select {...register('status')} className={`${ic(false)} cursor-pointer`}>
              {AGENT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </SectionCard>

        <div className="flex justify-end gap-3 mt-2">
          <Button type="button" variant="secondary" onClick={() => router.push('/agents')}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            {isEdit ? 'Save Changes' : 'Create Agent'}
          </Button>
        </div>
      </form>
    </div>
  );
}
