'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { showErrorToast } from '@/utils/errorToast';
import { vesselsService } from '@/services/vessels.service';
import { VESSEL_STATUS, OWNERSHIP_TYPES } from '@/utils/constants';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PageHeader from '@/components/ui/PageHeader';
import { partnersService } from '@/services/partners.service';
import JvMatrix, { pctToBp, bpToPct, validateRows } from './components/JvMatrix';

const CHARTER = ['Time Charter', 'Voyage Charter'];
const sharesKey = (rows) => JSON.stringify(rows.map((r) => [r.partnerId, pctToBp(r.pct), !!r.isLead]).sort());

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
  const [shares, setShares] = useState([]);
  const [loadedShares, setLoadedShares] = useState('[]');
  const [particulars, setParticulars] = useState(null);

  const { data: shareData } = useQuery({
    queryKey: ['vessel-shares', id],
    queryFn:  () => partnersService.getVesselShares(id).then(r => r.data.data),
    enabled:  isEdit,
  });
  useEffect(() => {
    if (!shareData) return;
    const rows = shareData.map(s => ({ partnerId: s.partnerId?._id || s.partnerId, pct: bpToPct(s.shareBp), isLead: !!s.isLead }));
    setShares(rows); setLoadedShares(sharesKey(rows));
  }, [shareData]);

  useEffect(() => {
    if (isEdit && vesselData) {
      reset({
        vesselCode:           vesselData.vesselCode,
        vesselName:           vesselData.vesselName,
        imoNumber:            vesselData.imoNumber            || '',
        flag:                 vesselData.flag                  || '',
        callSign:             vesselData.callSign              || '',
        reeferPlugs:          vesselData.reeferPlugs           ?? '',
        mainEngineFuelType:   vesselData.mainEngineFuelType    || '',
        auxEngineFuelType:    vesselData.auxEngineFuelType     || '',
        consumptionSeaMtDay:         vesselData.consumptionSeaMtDay         ?? '',
        consumptionPortIdleMtDay:    vesselData.consumptionPortIdleMtDay    ?? '',
        consumptionPortWorkingMtDay: vesselData.consumptionPortWorkingMtDay ?? '',
        defaultDailyHireRate: vesselData.defaultDailyHireRate  ?? '',
        ownershipType:        vesselData.ownershipType,
        ownerName:            vesselData.ownerName             || '',
        ownershipDescription: vesselData.ownershipDescription  || '',
        charterStartDate:     vesselData.charterStartDate ? vesselData.charterStartDate.split('T')[0] : '',
        charterEndDate:       vesselData.charterEndDate   ? vesselData.charterEndDate.split('T')[0]   : '',
        capacity:             vesselData.capacity  ?? '',
        dwt:                  vesselData.dwt       ?? '',
        builtYear:            vesselData.builtYear ?? '',
        // Extended particulars
        manager:              vesselData.manager              || '',
        loa:                  vesselData.loa                  ?? '',
        beam:                 vesselData.beam                 ?? '',
        summerDraft:          vesselData.summerDraft          ?? '',
        grossTonnage:         vesselData.grossTonnage         ?? '',
        netTonnage:           vesselData.netTonnage           ?? '',
        suezGT:               vesselData.suezGT               ?? '',
        suezNT:               vesselData.suezNT               ?? '',
        // Bunker capacities
        totalBunkerCapacity:  vesselData.totalBunkerCapacity  ?? '',
        vlsfoCapacity:        vesselData.vlsfoCapacity        ?? '',
        mdoCapacity:          vesselData.mdoCapacity          ?? '',
        fwCapacity:           vesselData.fwCapacity           ?? '',
        status:               vesselData.status,
        notes:                vesselData.notes || '',
      });
    }
  }, [vesselData, isEdit]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data };
      if (!CHARTER.includes(payload.ownershipType)) { payload.charterStartDate = null; payload.charterEndDate = null; }
      // JV matrix: validated client-side, and sent only when new or changed (the server locks it once money is posted).
      const err = (!isEdit || shares.length) ? validateRows(shares) : null;
      if (err) throw Object.assign(new Error(err), { clientMessage: err });
      if (!isEdit || sharesKey(shares) !== loadedShares) {
        payload.shares = shares.map(r => ({ partnerId: r.partnerId, shareBp: pctToBp(r.pct), isLead: !!r.isLead }));
      }
      const res = isEdit ? await vesselsService.update(id, payload) : await vesselsService.create(payload);
      const vesselId = res.data.data._id;
      if (particulars) await vesselsService.uploadParticulars(vesselId, particulars);
      return res;
    },
    onSuccess:  () => { toast.success(isEdit ? 'Vessel updated' : 'Vessel created'); router.push('/vessels'); },
    onError:    (e) => (e.clientMessage ? toast.error(e.clientMessage) : showErrorToast(e, isEdit ? 'update' : 'save')),
  });

  if (isEdit && isLoading) return <LoadingSpinner fullPage />;

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title={isEdit ? 'Edit Vessel' : 'New Vessel'}
        subtitle={isEdit ? `Editing: ${vesselData?.vesselName || '…'}` : 'Register a vessel in your fleet'}
        action={<Button variant="secondary" onClick={() => router.push('/vessels')}>← Back</Button>}
      />

      <form onSubmit={handleSubmit(d => mutation.mutate(d))}>

        {/* ── Basic Information ────────────────────────────────────────── */}
        <SectionCard title="A. Identity & Specifications">
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
              <label className={lc}>Call Sign <span className="text-red-400">*</span></label>
              <input {...register('callSign', { required: 'Call sign is required' })} placeholder="e.g. HOPQ1" className={ic(errors.callSign)} />
              {errors.callSign && <p className={ec}>{errors.callSign.message}</p>}
            </div>
            <div>
              <label className={lc}>Slot Capacity (TEU) <span className="text-red-400">*</span></label>
              <input type="number" min="0" {...register('capacity', { required: 'Slot capacity is required' })}
                placeholder="e.g. 14000" className={ic(errors.capacity)} />
              {errors.capacity && <p className={ec}>{errors.capacity.message}</p>}
            </div>
            <div>
              <label className={lc}>Reefer Plugs</label>
              <input type="number" min="0" step="1" {...register('reeferPlugs')} placeholder="e.g. 120" className={ic(false)} />
            </div>
            <div className="sm:col-span-2">
              <label className={lc}>Vessel Particulars File (PDF)</label>
              {isEdit && vesselData?.particularsFileUrl && (
                <p className="text-[12px] mb-1.5">
                  <a href={vesselsService.particularsUrl(id)} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                    {vesselData.particularsOriginalName || 'Current file'}
                  </a>
                  <span className="text-gray-400"> (choosing a new file replaces it)</span>
                </p>
              )}
              <input type="file" accept="application/pdf" onChange={(e) => setParticulars(e.target.files?.[0] || null)}
                className="block w-full text-[12px] text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-teal-700" />
            </div>
          </div>
        </SectionCard>

        {/* ── Specifications ───────────────────────────────────────────── */}
        <SectionCard title="Vessel Specifications (continued)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        {/* ── Vessel Particulars (extended) ───────────────────────────── */}
        <SectionCard title="Vessel Particulars">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="sm:col-span-2">
              <label className={lc}>Manager / Operator</label>
              <input {...register('manager')} placeholder="e.g. MSL Ship Management Ltd" className={ic(false)} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className={lc}>LOA (m)</label>
              <input type="number" min="0" step="0.01"
                {...register('loa')} placeholder="e.g. 299.95" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Beam (m)</label>
              <input type="number" min="0" step="0.01"
                {...register('beam')} placeholder="e.g. 48.20" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Summer Draft (m)</label>
              <input type="number" min="0" step="0.01"
                {...register('summerDraft')} placeholder="e.g. 14.50" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Built Year</label>
              <input type="number" min="1800"
                {...register('builtYear')} placeholder="e.g. 2015" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Gross Tonnage</label>
              <input type="number" min="0"
                {...register('grossTonnage')} placeholder="e.g. 141000" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Net Tonnage</label>
              <input type="number" min="0"
                {...register('netTonnage')} placeholder="e.g. 86000" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Suez GT</label>
              <input type="number" min="0"
                {...register('suezGT')} placeholder="e.g. 143500" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Suez NT</label>
              <input type="number" min="0"
                {...register('suezNT')} placeholder="e.g. 132000" className={ic(false)} />
            </div>
          </div>
        </SectionCard>

        {/* ── B. C/P Bunker Consumption Profile ─────────────────────────── */}
        <SectionCard title="B. C/P Bunker Consumption Profile">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={lc}>Main Engine Fuel Type</label>
              <input {...register('mainEngineFuelType')} placeholder="e.g. VLSFO" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>Auxiliary Engine Fuel Type</label>
              <input {...register('auxEngineFuelType')} placeholder="e.g. LSMGO" className={ic(false)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={lc}>Consumption at Sea (MT/day)</label>
              <input type="number" min="0" step="0.1" {...register('consumptionSeaMtDay')} className={ic(false)} />
            </div>
            <div>
              <label className={lc}>In Port — Idle (MT/day)</label>
              <input type="number" min="0" step="0.1" {...register('consumptionPortIdleMtDay')} className={ic(false)} />
            </div>
            <div>
              <label className={lc}>In Port — Working (MT/day)</label>
              <input type="number" min="0" step="0.1" {...register('consumptionPortWorkingMtDay')} className={ic(false)} />
            </div>
          </div>
        </SectionCard>

        {/* ── Bunker Capacities ────────────────────────────────────────── */}
        <SectionCard title="Bunker Capacities (MT)">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className={lc}>Total Bunker Cap.</label>
              <input type="number" min="0" step="0.1"
                {...register('totalBunkerCapacity')} placeholder="e.g. 5800" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>VLSFO (MT)</label>
              <input type="number" min="0" step="0.1"
                {...register('vlsfoCapacity')} placeholder="e.g. 4200" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>MDO (MT)</label>
              <input type="number" min="0" step="0.1"
                {...register('mdoCapacity')} placeholder="e.g. 800" className={ic(false)} />
            </div>
            <div>
              <label className={lc}>F.W. Tank (MT)</label>
              <input type="number" min="0" step="0.1"
                {...register('fwCapacity')} placeholder="e.g. 350" className={ic(false)} />
            </div>
          </div>
        </SectionCard>

        {/* ── Ownership ────────────────────────────────────────────────── */}
        <SectionCard title="C. Ownership & Charter Contract">
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
              <label className={lc}>Vessel Owner</label>
              <input {...register('ownerName')} placeholder="e.g. Maritime Solutions LLC" className={ic(false)} />
            </div>

            {CHARTER.includes(ownershipType) && (
              <>
                <div>
                  <label className={lc}>Delivery Date <span className="text-red-400">*</span></label>
                  <input type="date"
                    {...register('charterStartDate', { required: 'Required for chartered vessels' })}
                    className={ic(errors.charterStartDate)} />
                  {errors.charterStartDate && <p className={ec}>{errors.charterStartDate.message}</p>}
                </div>
                <div>
                  <label className={lc}>Redelivery Date <span className="text-red-400">*</span></label>
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

        {/* ── D. Financials & JV Partners ──────────────────────────────── */}
        <SectionCard title="D. Financials & JV Partners">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className={lc}>Default Daily Hire Rate (USD) <span className="text-red-400">*</span></label>
              <input type="number" min="0" step="0.01"
                {...register('defaultDailyHireRate', { required: 'Default daily hire rate is required' })}
                placeholder="e.g. 12500.00" className={ic(errors.defaultDailyHireRate)} />
              {errors.defaultDailyHireRate && <p className={ec}>{errors.defaultDailyHireRate.message}</p>}
            </div>
          </div>
          <p className={lc}>JV Partners Matrix <span className="text-red-400">*</span></p>
          <JvMatrix rows={shares} onChange={setShares} disabled={!!vesselData?.sharesLocked} />
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
