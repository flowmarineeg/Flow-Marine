'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { vesselsService } from '@/services/vessels.service';
import { VESSEL_STATUS, OWNERSHIP_TYPES } from '@/utils/constants';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
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

export default function VesselForm({ id = null }) {
  const router = useRouter();
  const isEdit = !!id;

  const { data: vesselData, isLoading } = useQuery({
    queryKey: ['vessel', id],
    queryFn:  () => vesselsService.getById(id).then(r => r.data.data),
    enabled:  isEdit,
  });

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm();
  const ownershipType = watch('ownershipType');

  useEffect(() => {
    if (isEdit && vesselData) {
      reset({
        vesselCode:           vesselData.vesselCode,
        vesselName:           vesselData.vesselName,
        imoNumber:            vesselData.imoNumber            || '',
        flag:                 vesselData.flag                  || '',
        callSign:             vesselData.callSign              || '',
        ownershipType:        vesselData.ownershipType,
        ownerName:            vesselData.ownerName             || '',
        ownershipDescription: vesselData.ownershipDescription  || '',
        charterStartDate:     vesselData.charterStartDate ? vesselData.charterStartDate.split('T')[0] : '',
        charterEndDate:       vesselData.charterEndDate   ? vesselData.charterEndDate.split('T')[0]   : '',
        capacity:             vesselData.capacity  ?? '',
        dwt:                  vesselData.dwt       ?? '',
        builtYear:            vesselData.builtYear ?? '',
        status:               vesselData.status,
        notes:                vesselData.notes || '',
      });
    }
  }, [vesselData, isEdit]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? vesselsService.update(id, data) : vesselsService.create(data),
    onSuccess:  () => { toast.success(isEdit ? 'Vessel updated' : 'Vessel created'); router.push('/vessels'); },
    onError:    (e) => toast.error(e.response?.data?.message || 'Operation failed'),
  });

  if (isEdit && isLoading) return <LoadingSpinner fullPage />;

  return (
    <div className="animate-fadeIn max-w-3xl">
      <PageHeader
        title={isEdit ? 'Edit Vessel' : 'New Vessel'}
        subtitle={isEdit ? `Editing: ${vesselData?.vesselName || '…'}` : 'Register a vessel in your fleet'}
        action={<Button variant="secondary" onClick={() => router.push('/vessels')}>← Back</Button>}
      />

      <form onSubmit={handleSubmit(d => mutation.mutate(d))}>

        {/* ── Basic Information ────────────────────────────────────────── */}
        <SectionCard title="Basic Information">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>Vessel Code <span className="text-red-400">*</span></label>
              <input {...register('vesselCode', { required: 'Vessel code is required' })}
                placeholder="e.g. MSL-JEBALI" className={ic(errors.vesselCode)} />
              {errors.vesselCode && <p className={ec}>{errors.vesselCode.message}</p>}
            </div>
            <div>
              <label className={lc}>Vessel Name <span className="text-red-400">*</span></label>
              <input {...register('vesselName', { required: 'Vessel name is required' })}
                placeholder="e.g. MSL Jebel Ali" className={ic(errors.vesselName)} />
              {errors.vesselName && <p className={ec}>{errors.vesselName.message}</p>}
            </div>
            <div>
              <label className={lc}>IMO Number <span className="text-red-400">*</span></label>
              <input
                {...register('imoNumber', {
                  required: 'IMO number is required',
                  pattern: { value: /^\d{7}$/, message: 'IMO must be exactly 7 digits' },
                })}
                placeholder="7-digit number (e.g. 9123456)"
                maxLength={7}
                className={ic(errors.imoNumber)}
              />
              {errors.imoNumber && <p className={ec}>{errors.imoNumber.message}</p>}
            </div>
            <div>
              <label className={lc}>Flag</label>
              <input {...register('flag')} placeholder="e.g. Panama" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Call Sign</label>
              <input {...register('callSign')} placeholder="e.g. HOPQ1" className={ic(false)} />
            </div>
          </div>
        </SectionCard>

        {/* ── Ownership ────────────────────────────────────────────────── */}
        <SectionCard title="Ownership">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>Ownership Type <span className="text-red-400">*</span></label>
              <select
                {...register('ownershipType', { required: 'Ownership type is required' })}
                className={`${ic(errors.ownershipType)} cursor-pointer`}
              >
                <option value="">Select type…</option>
                {OWNERSHIP_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {errors.ownershipType && <p className={ec}>{errors.ownershipType.message}</p>}
            </div>
            <div>
              <label className={lc}>Owner Name</label>
              <input {...register('ownerName')} placeholder="e.g. Maritime Solutions LLC" className={ic(false)} />
            </div>

            {ownershipType === 'Chartered' && (
              <>
                <div>
                  <label className={lc}>Charter Start Date <span className="text-red-400">*</span></label>
                  <input type="date"
                    {...register('charterStartDate', { required: 'Required for chartered vessels' })}
                    className={ic(errors.charterStartDate)} />
                  {errors.charterStartDate && <p className={ec}>{errors.charterStartDate.message}</p>}
                </div>
                <div>
                  <label className={lc}>Charter End Date <span className="text-red-400">*</span></label>
                  <input type="date"
                    {...register('charterEndDate', { required: 'Required for chartered vessels' })}
                    className={ic(errors.charterEndDate)} />
                  {errors.charterEndDate && <p className={ec}>{errors.charterEndDate.message}</p>}
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <label className={lc}>Ownership Description</label>
              <textarea
                {...register('ownershipDescription')}
                rows={2}
                placeholder="Notes about this ownership arrangement, charter terms, lease conditions…"
                className={`${ic(false)} resize-none`}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── Specifications ───────────────────────────────────────────── */}
        <SectionCard title="Vessel Specifications">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={lc}>Capacity (TEU)</label>
              <input type="number" min="0"
                {...register('capacity')}
                placeholder="e.g. 14000" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>DWT (tonnes)</label>
              <input type="number" min="0"
                {...register('dwt')}
                placeholder="e.g. 165000" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Built Year</label>
              <input type="number" min="1800"
                {...register('builtYear')}
                placeholder="e.g. 2015" className={ic(false)} />
            </div>
          </div>
        </SectionCard>

        {/* ── Status & Notes ───────────────────────────────────────────── */}
        <SectionCard title="Status & Notes">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>Status</label>
              <select {...register('status')} className={`${ic(false)} cursor-pointer`}>
                {VESSEL_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lc}>Notes</label>
              <textarea rows={3} placeholder="Optional notes…"
                {...register('notes')}
                className={`${ic(false)} resize-none`} />
            </div>
          </div>
        </SectionCard>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 mt-2">
          <Button type="button" variant="secondary" onClick={() => router.push('/vessels')}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            {isEdit ? 'Save Changes' : 'Create Vessel'}
          </Button>
        </div>
      </form>
    </div>
  );
}
