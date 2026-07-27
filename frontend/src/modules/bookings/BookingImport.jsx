'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { bookingsService } from '@/services/bookings.service';
import { agentsService } from '@/services/agents.service';
import { voyagesService } from '@/services/voyages.service';
import { exportService } from '@/services/export.service';
import { downloadFile } from '@/utils/exportHelper';
import { showErrorToast } from '@/utils/errorToast';
import { useRounds } from '@/hooks/useRounds';
import PageHeader from '@/components/ui/PageHeader';

// ─── Row status → visual style ───────────────────────────────────────────────
// Sprint 031: 'unresolved'/'ambiguous' are fixable-in-place (pick a Voyage
// below), distinct from 'invalid' (red, always skipped on save).
const ROW_STYLES = {
  valid:      { bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',   label: 'Valid' },
  new:        { bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',   label: 'New' },
  update:     { bg: 'bg-amber-50',  badge: 'bg-amber-100 text-amber-700',   label: 'Will Update' },
  unresolved: { bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', label: 'Needs Voyage' },
  ambiguous:  { bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', label: 'Confirm Voyage' },
  duplicate:  { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-600',       label: 'Duplicate' },
  invalid:    { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-600',       label: 'Invalid' },
};

// ─── Excel column header → internal field ────────────────────────────────────
// Sprint 026: aliases expanded; currency removed; dg/dangerous goods restored;
//             hazardous added as alias for dg; imdg code added; size/length added
const EXCEL_COLUMN_MAP = {
  'booking number': 'bookingNumber',
  'booking no': 'bookingNumber',
  'bk no': 'bookingNumber',
  'container number': 'containerNumber',
  'container no': 'containerNumber',
  'cntr no': 'containerNumber',
  'container type': 'containerType',
  'cntr type': 'containerType',
  'type': 'containerType',
  'container size': 'containerSize',
  'cntr size': 'containerSize',
  'size': 'containerSize',         // new alias
  'length': 'containerSize',       // new alias
  'pol': 'pol',
  'port of loading': 'pol',
  'pod': 'pod',
  'port of discharge': 'pod',
  'rate': 'rate',
  'freight rate': 'rate',
  // currency removed in Sprint 026
  'shipper': 'shipper',
  'consignee': 'consignee',
  'carrier name': 'carrierName',
  'carrier': 'carrierName',        // alias
  'commodity': 'commodity',
  'vgm': 'vgm',
  'verified gross mass': 'vgm',
  'hazardous': 'dg',               // new alias — Excel header maps to internal dg field
  'dg': 'dg',                      // restored (removed in Sprint 025, back in Sprint 026)
  'dangerous goods': 'dg',         // restored
  // dg % / dg percent removed in Sprint 026 — replaced by imdg code
  'imdg code': 'imdgCode',         // new
  'imdg': 'imdgCode',              // new alias
  'container status': 'containerStatus',
  'cntr status': 'containerStatus',
  // bare 'status' NOT mapped — conflicts with booking status field
};

// ─── Column guide / template — Sprint 042: the backend is now the single
// source of truth for BOTH the "Expected Excel Columns" reference card below
// AND the downloadable blank template (colored required/optional headers),
// via GET /bookings/import/template-columns and GET /bookings/import/template
// — no local hardcoded copy here anymore, so the two can never drift apart.
// Deliberately NOT copied from export.service.js#COLUMNS.bookings — that
// column set is for record export, not import (see bookingImport.service.js
// TEMPLATE_FIELDS comment for the full list of mismatches).

// ─── Parse Excel ─────────────────────────────────────────────────────────────
const parseExcel = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (raw.length < 2) return [];
  const headers = raw[0].map(h => String(h).trim().toLowerCase());
  return raw.slice(1).reduce((acc, rowArr) => {
    if (rowArr.every(c => c === '' || c == null)) return acc;
    const obj = {};
    headers.forEach((h, i) => {
      const field = EXCEL_COLUMN_MAP[h];
      if (field) obj[field] = String(rowArr[i] ?? '').trim();
    });
    acc.push(obj);
    return acc;
  }, []);
};

// ─── Editable cell ────────────────────────────────────────────────────────────
function EditableCell({ value, onChange, hasError }) {
  return (
    <input
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className={`w-full text-[12px] border rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 transition min-w-[60px] ${hasError
        ? 'border-red-300 focus:ring-red-400/30'
        : 'border-gray-200 focus:border-teal-400 focus:ring-teal-400/20'
        }`}
    />
  );
}

function SummaryBadge({ label, count, color }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full ${color}`}>
      {count} {label}
    </span>
  );
}

const fmt = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : null;

// ─── Main ────────────────────────────────────────────────────────────────────
export default function BookingImport() {
  const router = useRouter();
  const fileRef = useRef(null);

  const [agentId, setAgentId] = useState('');
  const [roundId, setRoundId] = useState('');  // Sprint 031: replaces the single-Voyage selector
  const [importType, setImportType] = useState('booking');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Agents
  const { data: agentsData } = useQuery({
    queryKey: ['agents-import-dd'],
    queryFn: () => agentsService.list({ limit: 200, status: 'Active' }).then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
  const agents = agentsData || [];

  // Rounds
  const { rounds } = useRounds();

  // Sprint 042 — the backend is the single source of truth for the import's
  // recognized column list (name + required/optional), used by both the
  // guide card below and the colored downloadable template.
  const { data: templateColumns } = useQuery({
    queryKey: ['booking-import-template-columns'],
    queryFn: () => bookingsService.importTemplateColumns().then(r => r.data.data),
    staleTime: 10 * 60 * 1000,
  });

  const handleDownloadTemplate = async () => {
    try {
      const res = await bookingsService.downloadImportTemplate();
      downloadFile(res.data, 'booking-import-template.xlsx');
    } catch (e) {
      const msg = await exportService.readBlobError(e);
      toast.error(msg || 'Failed to download template');
    }
  };

  // Sprint 031: this Round's active voyages — no longer a file-wide selector.
  // Used only to populate the per-row manual Voyage fallback for
  // 'unresolved'/'ambiguous' rows; every row auto-resolves its own voyage
  // server-side from POL/POD whenever possible.
  const { data: voyagesData, isLoading: voyagesLoading } = useQuery({
    queryKey: ['voyages-import-dd', roundId],
    queryFn: () => voyagesService.list({ roundId, limit: 500, page: 1 }).then(r => r.data.data),
    staleTime: 2 * 60 * 1000,
    enabled: !!roundId,
  });
  const roundVoyages = (voyagesData || []).filter(v => v.status !== 'Cancelled');

  // File handler
  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['xlsx', 'xls', 'csv'].includes(file.name.split('.').pop().toLowerCase())) {
      toast.error('Please select an Excel or CSV file');
      return;
    }
    setFileName(file.name);
    setPreview(null);
    setConfirmed(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseExcel(new Uint8Array(ev.target.result));
        if (!rows.length) { toast.error('No data rows found in file'); return; }
        setRawRows(rows);
        toast.success(`${rows.length} row${rows.length !== 1 ? 's' : ''} loaded`);
      } catch (err) {
        toast.error('Failed to read file');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Preview
  const handlePreview = async () => {
    if (!agentId) { toast.error('Please select an agent'); return; }
    if (!roundId) { toast.error('Please select a round'); return; }
    if (!rawRows.length) { toast.error('Please upload an Excel file'); return; }
    setIsPreviewing(true);
    setConfirmed(false);
    try {
      const res = await bookingsService.importPreview({ rows: rawRows, agentId, roundId, importType });
      setPreview(res.data.data);
    } catch (e) {
      showErrorToast(e, 'preview');
    } finally {
      setIsPreviewing(false);
    }
  };

  const updateRow = (idx, field, value) =>
    setPreview(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: value }; return n; });

  // Re-validate
  const handleReValidate = async () => {
    if (!preview) return;
    setIsPreviewing(true);
    try {
      const res = await bookingsService.importPreview({
        rows: preview.map(r => ({
          bookingNumber: r.bookingNumber,
          containerNumber: r.containerNumber,
          containerType: r.containerType,
          containerSize: r.containerSize,
          pol: r.pol, pod: r.pod,
          rate: r.rate,
          // currency removed Sprint 026
          shipper: r.shipper,
          consignee: r.consignee,
          carrierName: r.carrierName,
          commodity: r.commodity,
          vgm: r.vgm,
          dg: r.dg,
          imdgCode: r.imdgCode,    // Sprint 026: replaces dgPercent
          containerStatus: r.containerStatus,
          voyageOverrideId: r.voyageOverrideId, // Sprint 031: manual Voyage fallback
        })),
        agentId, roundId, importType,
      });
      setPreview(res.data.data);
      toast.success('Re-validated');
    } catch (e) {
      showErrorToast(e, 'preview');
    } finally {
      setIsPreviewing(false);
    }
  };

  // Save
  const saveMutation = useMutation({
    mutationFn: () => bookingsService.importSave({ rows: preview, agentId, roundId, importType }),
    onSuccess: (res) => {
      const d = res.data.data;
      const parts = [];
      if (d.created?.length) parts.push(`${d.created.length} created`);
      if (d.updated?.length) parts.push(`${d.updated.length} updated`);
      if (d.failed?.length) parts.push(`${d.failed.length} failed`);
      if (d.markedFinalLoading?.length) parts.push(`${d.markedFinalLoading.length} marked Final Loading`);
      if (d.cancelled?.length) parts.push(`${d.cancelled.length} cancelled`);
      toast.success(`Import complete — ${parts.join(' · ')}`);
      setConfirmed(true);
    },
    onError: (e) => showErrorToast(e, 'import'),
  });

  const counts = preview ? {
    valid:       preview.filter(r => r._rowStatus === 'valid').length,
    new:         preview.filter(r => r._rowStatus === 'new').length,
    update:      preview.filter(r => r._rowStatus === 'update').length,
    unresolved:  preview.filter(r => r._rowStatus === 'unresolved').length,
    ambiguous:   preview.filter(r => r._rowStatus === 'ambiguous').length,
    duplicate:   preview.filter(r => r._rowStatus === 'duplicate').length,
    invalid:     preview.filter(r => r._rowStatus === 'invalid').length,
  } : null;

  const saveableCount = preview
    ? preview.filter(r => ['valid', 'new', 'update'].includes(r._rowStatus)).length
    : 0;
  const needsVoyageCount = counts ? counts.unresolved + counts.ambiguous : 0;

  const sc = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition cursor-pointer disabled:opacity-60';
  const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';
  const importResult = saveMutation.data?.data?.data;

  return (
    <div className="animate-fadeIn max-w-full">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => router.push('/bookings')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
          </svg>
          Bookings
        </button>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-700">Import Bookings</span>
      </div>

      <PageHeader
        title="Import Bookings"
        subtitle="Upload an Excel file to bulk-create or update bookings across a Round — each row resolves its own Voyage automatically from POL/POD"
      />

      {/* ── Settings ─────────────────────────────────────────────────── */}
      <div className="card p-6 mb-5">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Import Settings</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {/* Agent */}
          <div>
            <label className={lc}>Agent <span className="text-red-400">*</span></label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} className={sc}>
              <option value="">Select agent…</option>
              {agents.map(a => (
                <option key={a._id} value={a._id}>{a.agentCode ? `${a.agentCode} — ` : ''}{a.agentName}</option>
              ))}
            </select>
          </div>

          {/* Round — Sprint 031: the only routing selector; a file may contain
              rows for multiple voyages within this Round */}
          <div>
            <label className={lc}>Round <span className="text-red-400">*</span></label>
            <select
              value={roundId}
              onChange={e => { setRoundId(e.target.value); setPreview(null); setConfirmed(false); }}
              className={sc}
            >
              <option value="">Select round…</option>
              {rounds.map(r => (
                <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>
              ))}
            </select>
          </div>

          {/* Import type */}
          <div>
            <label className={lc}>Import Type <span className="text-red-400">*</span></label>
            <select
              value={importType}
              onChange={e => { setImportType(e.target.value); setPreview(null); setConfirmed(false); }}
              className={sc}
            >
              <option value="booking">Booking</option>
              <option value="finalLoading">Final Loading</option>
            </select>
          </div>

          {/* File */}
          <div>
            <label className={lc}>Excel File <span className="text-red-400">*</span></label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700 transition text-left truncate">
              {fileName || 'Choose file…'}
            </button>
            {rawRows.length > 0 && (
              <p className="mt-1 text-[11px] text-teal-600 font-semibold">✓ {rawRows.length} rows loaded</p>
            )}
          </div>
        </div>

        {/* Import type description */}
        <div className={`rounded-xl px-4 py-3 text-xs flex items-start gap-2 mb-4 ${importType === 'booking'
          ? 'bg-blue-50 border border-blue-200 text-blue-700'
          : 'bg-amber-50 border border-amber-200 text-amber-700'
          }`}>
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {importType === 'booking' ? (
            <span>
              <strong>Booking mode:</strong> Each row resolves its own Voyage from its POL/POD, matched
              against this Round's voyages — no need to split a multi-voyage file. Rows are matched by
              <strong> Container Number</strong> within this Round + Agent scope — existing containers are
              updated (orange), new ones created (green). Only resolvable, valid rows are saved. No bookings
              are cancelled.
            </span>
          ) : (
            <span>
              <strong>Final Loading mode:</strong> Represents the complete manifest for this Round + Agent —
              not just one voyage. Rows are matched by <strong>Container Number</strong>; existing bookings are
              updated (orange), new ones created (green), and matched bookings are marked <strong>Final Loading</strong>.
              Any booking for this <strong>same agent</strong>, on <strong>any voyage in this Round</strong>, whose
              container number is <strong>NOT</strong> in this file is marked <strong>Cancelled</strong>. Bookings
              from other agents are never affected. Invalid rows (red) are always skipped.
            </span>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={handlePreview}
            disabled={isPreviewing || !rawRows.length || !agentId || !roundId}
            className="btn btn-primary btn-md flex items-center gap-2">
            {isPreviewing ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>Validating…</>
            ) : (
              <><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>Preview Import</>
            )}
          </button>
        </div>
      </div>

      {/* ── Column guide ──────────────────────────────────────────────── */}
      {!preview && (
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Expected Excel Columns</p>
            <button type="button" onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-800 transition">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
              </svg>
              Download Template
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {(templateColumns || []).map(({ header, note, required }) => (
              <div key={header} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <p className="text-[12px] font-semibold text-gray-700">
                  {header}{required && <span className="text-red-400 ml-0.5">*</span>}
                </p>
                <p className="text-[11px] text-gray-400 leading-snug">{note}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            One file may contain rows for <strong>multiple voyages</strong> within the selected Round —
            each row's Voyage is resolved automatically from its own POL/POD. You'll only be asked to pick a
            Voyage manually for rows the system can't resolve on its own.
          </p>
        </div>
      )}

      {/* ── Preview ───────────────────────────────────────────────────── */}
      {preview && (
        <div className="flex max-w-full flex-col gap-4">

          {/* Summary */}
          <div className="card p-4 flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mr-1">Preview</p>
            {importType === 'booking' ? (
              <>
                {counts.valid > 0 && <SummaryBadge label="New" count={counts.valid} color="bg-green-100 text-green-700" />}
                {counts.update > 0 && <SummaryBadge label="Will Update" count={counts.update} color="bg-amber-100 text-amber-700" />}
                {needsVoyageCount > 0 && <SummaryBadge label="Needs Voyage" count={needsVoyageCount} color="bg-orange-100 text-orange-700" />}
                {counts.invalid > 0 && <SummaryBadge label="Invalid" count={counts.invalid} color="bg-red-100 text-red-600" />}
              </>
            ) : (
              <>
                {counts.new > 0 && <SummaryBadge label="New" count={counts.new} color="bg-green-100 text-green-700" />}
                {counts.update > 0 && <SummaryBadge label="Will Update" count={counts.update} color="bg-amber-100 text-amber-700" />}
                {needsVoyageCount > 0 && <SummaryBadge label="Needs Voyage" count={needsVoyageCount} color="bg-orange-100 text-orange-700" />}
                {counts.invalid > 0 && <SummaryBadge label="Invalid" count={counts.invalid} color="bg-red-100 text-red-600" />}
              </>
            )}
            <div className="ml-auto">
              <button onClick={handleReValidate} disabled={isPreviewing}
                className="btn btn-secondary btn-sm flex items-center gap-1.5">
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Re-validate
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center text-[11px] text-gray-500">
            <span className="font-semibold text-gray-400">Legend:</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-300 inline-block" />
              {importType === 'booking' ? 'Valid — will be created' : 'New — will be created'}</span>
            {importType === 'finalLoading' && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-300 inline-block" />Existing — will be updated + marked Final Loading</span>}
            {importType === 'booking' && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-300 inline-block" />Existing — will be updated</span>}
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-300 inline-block" />Needs Voyage — pick one below, then Re-validate</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-300 inline-block" />Invalid — skipped</span>
            <span className="text-gray-400">· Edit any cell then Re-validate.</span>
          </div>

          {/* Final Loading warning */}
          {importType === 'finalLoading' && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>
                After confirming: all imported bookings will be marked <strong>Final Loading</strong>.
                Any existing booking for the <strong>same agent</strong>, on <strong>any voyage in this Round</strong>,
                that is <strong>not</strong> in this file will be marked <strong>Cancelled</strong>.
                Bookings from other agents are not affected.
              </span>
            </div>
          )}

          {/* Needs-voyage warning */}
          {needsVoyageCount > 0 && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-xs text-orange-700">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>
                {counts.unresolved > 0 && <>{counts.unresolved} row{counts.unresolved !== 1 ? 's' : ''} found no matching Voyage in this Round. </>}
                {counts.ambiguous > 0 && <>{counts.ambiguous} row{counts.ambiguous !== 1 ? 's' : ''} matched more than one Voyage. </>}
                Pick the correct Voyage in the table below, then click Re-validate.
              </span>
            </div>
          )}

          {/* prview Table — overflow-x-auto clips the table, min-w-0 on the card prevents page
              blowout. Sprint 042: overflow-y-auto + max-h caps vertical growth for large imports
              (hundreds of rows), with a sticky header so columns stay visible while scrolling. */}
          <div className="card overflow-hidden max-w-full min-w-0">
            <div className="overflow-x-auto overflow-y-auto max-h-[65vh]">
              <table className="w-full border-collapse text-[12px]" style={{ minWidth: 1600 }}>
                <thead className="sticky top-0 z-10">
                  <tr className="table-header text-[11px] bg-white">
                    {['#', 'Status', 'Booking No', 'Cntr No *', 'Type', 'Size', 'Cntr Status *', 'POL', 'POD', 'Voyage', 'Rate', 'Carrier', 'Commodity', 'VGM', 'Hazardous', 'IMDG Code', 'Shipper', 'Consignee', 'Issues'].map(h => (
                      <th key={h} className="!py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, idx) => {
                    const st = ROW_STYLES[row._rowStatus] || ROW_STYLES.invalid;
                    const needsVoyagePick = row._rowStatus === 'unresolved' || row._rowStatus === 'ambiguous';
                    // Ambiguous rows only offer their actual candidates; unresolved rows offer the whole Round.
                    const voyageOptions = row._rowStatus === 'ambiguous' && row._voyageCandidates?.length
                      ? row._voyageCandidates
                      : roundVoyages;
                    return (
                      <tr key={idx} className={`border-b border-gray-100 ${st.bg}`}>
                        <td className="px-3 py-1.5 text-center text-gray-400 font-semibold w-8">{idx + 1}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
                        </td>
                        <td className="px-1.5 py-1 min-w-[110px]"><EditableCell value={row.bookingNumber} onChange={v => updateRow(idx, 'bookingNumber', v)} /></td>
                        <td className="px-1.5 py-1 min-w-[120px]"><EditableCell value={row.containerNumber} onChange={v => updateRow(idx, 'containerNumber', v)} hasError={row._errors?.some(e => e.includes('Container Number'))} /></td>
                        <td className="px-1.5 py-1 min-w-[60px]"><EditableCell value={row.containerType} onChange={v => updateRow(idx, 'containerType', v)} hasError={row._errors?.some(e => e.includes('Container type') || e.includes('Container Type'))} /></td>
                        <td className="px-1.5 py-1 min-w-[55px]"><EditableCell value={row.containerSize} onChange={v => updateRow(idx, 'containerSize', v)} /></td>
                        <td className="px-1.5 py-1 min-w-[80px]"><EditableCell value={row.containerStatus} onChange={v => updateRow(idx, 'containerStatus', v)} hasError={row._errors?.some(e => e.includes('Container Status'))} /></td>
                        <td className="px-1.5 py-1 min-w-[110px]"><EditableCell value={row.pol} onChange={v => updateRow(idx, 'pol', v)} hasError={row._errors?.some(e => e.includes('POL'))} /></td>
                        <td className="px-1.5 py-1 min-w-[110px]"><EditableCell value={row.pod} onChange={v => updateRow(idx, 'pod', v)} hasError={row._errors?.some(e => e.includes('POD'))} /></td>
                        <td className="px-1.5 py-1 min-w-[150px]">
                          {needsVoyagePick ? (
                            <select
                              value={row.voyageOverrideId || ''}
                              onChange={e => updateRow(idx, 'voyageOverrideId', e.target.value)}
                              className="w-full text-[11px] border border-orange-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400/30"
                              disabled={voyagesLoading}
                            >
                              <option value="">{voyagesLoading ? 'Loading…' : 'Select voyage…'}</option>
                              {voyageOptions.map(v => (
                                <option key={v._id} value={v._id}>
                                  {v.voyageNumber} — {v.voyageName || 'unnamed'} ({v.polId?.name || v.polId?.code || '?'} → {v.podId?.name || v.podId?.code || '?'})
                                </option>
                              ))}
                            </select>
                          ) : row._resolvedVoyage ? (
                            <span className="text-[11px] text-gray-600">
                              <span className="font-semibold text-gray-700">{row._resolvedVoyage.voyageNumber} ({row._resolvedVoyage.voyageName || 'unnamed'})</span>
                              <br />
                              <span className="text-gray-400">{row._resolvedVoyage.polId?.name} → {row._resolvedVoyage.podId?.name}</span>
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1 min-w-[65px]"><EditableCell value={row.rate} onChange={v => updateRow(idx, 'rate', v)} hasError={row._errors?.some(e => e.includes('Rate'))} /></td>
                        {/* currency column removed Sprint 026 */}
                        <td className="px-1.5 py-1 min-w-[100px]"><EditableCell value={row.carrierName} onChange={v => updateRow(idx, 'carrierName', v)} /></td>
                        <td className="px-1.5 py-1 min-w-[100px]"><EditableCell value={row.commodity} onChange={v => updateRow(idx, 'commodity', v)} /></td>
                        <td className="px-1.5 py-1 min-w-[60px]"><EditableCell value={row.vgm} onChange={v => updateRow(idx, 'vgm', v)} /></td>
                        <td className="px-1.5 py-1 min-w-[70px]"><EditableCell value={row.dg} onChange={v => updateRow(idx, 'dg', v)} /></td>
                        <td className="px-1.5 py-1 min-w-[90px]"><EditableCell value={row.imdgCode} onChange={v => updateRow(idx, 'imdgCode', v)} hasError={row._errors?.some(e => e.includes('IMDG'))} /></td>
                        <td className="px-1.5 py-1 min-w-[100px]"><EditableCell value={row.shipper} onChange={v => updateRow(idx, 'shipper', v)} /></td>
                        <td className="px-1.5 py-1 min-w-[100px]"><EditableCell value={row.consignee} onChange={v => updateRow(idx, 'consignee', v)} /></td>
                        <td className="px-2 py-1.5 min-w-[140px] max-w-[180px]">
                          {row._errors?.length > 0
                            ? <ul className="space-y-0.5">{row._errors.map((e, i) => <li key={i} className="text-[10px] text-red-600 leading-snug">• {e}</li>)}</ul>
                            : <span className="text-[10px] text-green-600">—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Confirm */}
          {!confirmed && (
            <div className="card p-5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  Ready to save {saveableCount} row{saveableCount !== 1 ? 's' : ''}
                  {counts && (counts.duplicate + counts.invalid + needsVoyageCount) > 0 && (
                    <span className="text-red-400 font-normal ml-1.5">({counts.duplicate + counts.invalid + needsVoyageCount} will be skipped)</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Edit rows then Re-validate. Nothing is saved until you confirm.</p>
              </div>
              <button onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || saveableCount === 0}
                className="btn btn-primary btn-md flex items-center gap-2 flex-shrink-0">
                {saveMutation.isPending ? (
                  <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>Saving…</>
                ) : (
                  <><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M5 13l4 4L19 7" />
                  </svg>Confirm Import</>
                )}
              </button>
            </div>
          )}

          {/* Result card */}
          {confirmed && importResult && (
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Import Complete</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {importResult.created?.length > 0 && (
                      <span className="text-[11px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                        {importResult.created.length} created
                      </span>
                    )}
                    {importResult.updated?.length > 0 && (
                      <span className="text-[11px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                        {importResult.updated.length} updated
                      </span>
                    )}
                    {importResult.markedFinalLoading?.length > 0 && (
                      <span className="text-[11px] bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                        {importResult.markedFinalLoading.length} marked Final Loading
                      </span>
                    )}
                    {importResult.cancelled?.length > 0 && (
                      <span className="text-[11px] bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">
                        {importResult.cancelled.length} cancelled (not in manifest)
                      </span>
                    )}
                    {importResult.failed?.length > 0 && (
                      <span className="text-[11px] bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full">
                        {importResult.failed.length} failed
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {importResult.failed?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <p className="text-[11px] font-bold text-red-600 mb-1.5">Failed rows:</p>
                  {importResult.failed.map((f, i) => (
                    <p key={i} className="text-[11px] text-red-600">{f.bookingNumber || `Row ${i + 1}`}: {f.reason}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button onClick={() => router.push('/bookings')} className="btn btn-primary btn-md">Go to Bookings</button>
                <button
                  onClick={() => { setPreview(null); setRawRows([]); setFileName(''); setConfirmed(false); if (fileRef.current) fileRef.current.value = ''; }}
                  className="btn btn-secondary btn-md">
                  Import Another File
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
