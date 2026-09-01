'use client';

/**
 * Sprint 027 — Export Discharge List modal.
 *
 * Allows operations users to select a Voyage + Agent and download an Excel
 * file of all Final Loading bookings for that scope.
 *
 * No dedicated count endpoint (revision R1 from Sprint 027).
 * Empty-result feedback is handled by the 404 from the export endpoint itself.
 */

import { useState, useEffect } from 'react';
import toast                   from 'react-hot-toast';
import Modal                   from '@/components/ui/Modal';
import { bookingsService }     from '@/services/bookings.service';
import { exportService }       from '@/services/export.service';
import { downloadFile }        from '@/utils/exportHelper';
import { getVoyageLabel }      from '@/utils/voyageLabel';

const sc = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition cursor-pointer disabled:opacity-60';
const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

export default function DischargeListExportModal({ open, onClose, voyages = [], agents = [] }) {
  const [voyageId,   setVoyageId]   = useState('');
  const [agentId,    setAgentId]    = useState('');
  const [isLoading,  setIsLoading]  = useState(false);

  // Reset selectors when modal closes
  useEffect(() => {
    if (!open) {
      setVoyageId('');
      setAgentId('');
      setIsLoading(false);
    }
  }, [open]);

  const canExport = !!voyageId && !!agentId && !isLoading;

  const handleExport = async () => {
    if (!canExport) return;
    setIsLoading(true);
    try {
      const res = await bookingsService.exportDischargeList({ voyageId, agentId });
      // Read filename from Content-Disposition header if available
      const disposition = res.headers?.['content-disposition'] || '';
      const match       = disposition.match(/filename="?([^";\n]+)"?/);
      const filename    = match ? match[1].trim() : 'Discharge_List.xlsx';
      downloadFile(res.data, filename);
      const count = res.headers?.['x-export-count'];
      toast.success(`Discharge List exported${count ? ` — ${count} container${count !== '1' ? 's' : ''}` : ''}`);
      onClose();
    } catch (e) {
      // 404 = no Final Loading bookings — show clear message, modal stays open
      const msg = await exportService.readBlobError(e);
      toast.error(msg || 'Export failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Only non-cancelled voyages available for export
  const selectableVoyages = voyages.filter(v => v.status !== 'Cancelled');

  return (
    <Modal open={open} onClose={onClose} title="Export Discharge List" size="sm">
      <div className="flex flex-col gap-5 pt-1">

        {/* Info banner */}
        <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-700">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Exports all <strong>Final Loading</strong> containers for the selected
            Voyage and Agent. The file reflects the current operational state.
          </span>
        </div>

        {/* Voyage selector */}
        <div>
          <label className={lc}>Voyage <span className="text-red-400">*</span></label>
          <select
            value={voyageId}
            onChange={e => setVoyageId(e.target.value)}
            className={sc}
            disabled={isLoading}
          >
            <option value="">Select voyage…</option>
            {selectableVoyages.map(v => (
              <option key={v._id} value={v._id}>
                {getVoyageLabel(v)}
                {v.polId?.name ? ` — ${v.polId.name}` : ''}
                {v.podId?.name ? ` → ${v.podId.name}` : ''}
                {` [${v.status}]`}
              </option>
            ))}
          </select>
        </div>

        {/* Agent selector */}
        <div>
          <label className={lc}>Agent <span className="text-red-400">*</span></label>
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            className={sc}
            disabled={isLoading}
          >
            <option value="">Select agent…</option>
            {agents.map(a => (
              <option key={a._id} value={a._id}>
                {a.agentCode ? `${a.agentCode} — ` : ''}{a.agentName}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="btn btn-secondary btn-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!canExport}
            className="btn btn-primary btn-md flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Exporting…
              </>
            ) : (
              <>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </>
            )}
          </button>
        </div>

      </div>
    </Modal>
  );
}
