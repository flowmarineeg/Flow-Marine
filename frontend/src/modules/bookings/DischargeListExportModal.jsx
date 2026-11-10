'use client';

/**
 * Discharge list by POL -> POD (Sprint 027, reworked 2026-11-10).
 *
 * Pick the round, POL and POD (optionally one agent): the screen lists every Final Loading booking that goes
 * from that POL to that POD across all voyages of the round, with its discharge state, and exports the same
 * list to Excel. The sheet is what the Discharge import reads back (Container Number, POL, POD …).
 */

import { useState } from 'react';
import { useQuery }            from '@tanstack/react-query';
import toast                   from 'react-hot-toast';
import Modal                   from '@/components/ui/Modal';
import { bookingsService }     from '@/services/bookings.service';
import { exportService }       from '@/services/export.service';
import { downloadFile }        from '@/utils/exportHelper';
import { useBookingLookups }   from '@/hooks/useBookingLookups';
import { getVoyageLabel }      from '@/utils/voyageLabel';

const sc = 'w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition cursor-pointer disabled:opacity-60';
const lc = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

const STATE_STYLE = {
  Discharged: 'bg-green-100 text-green-700',
  Remaining:  'bg-red-100 text-red-700',
};

// The inner component only exists while the modal is open, so its selections reset on close.
export default function DischargeListExportModal({ open, onClose }) {
  return open ? <DischargeListBody onClose={onClose} /> : null;
}

function DischargeListBody({ onClose }) {
  const open = true;
  const [roundId,   setRoundId]   = useState('');
  const [polId,     setPolId]     = useState('');
  const [podId,     setPodId]     = useState('');
  const [agentId,   setAgentId]   = useState('');
  const [exporting, setExporting] = useState(false);

  const { agents, rounds, ports } = useBookingLookups(roundId);

  const ready = !!roundId && !!polId && !!podId && polId !== podId;
  const params = { roundId, polId, podId, agentId: agentId || undefined };

  const { data: list, isFetching, error } = useQuery({
    queryKey: ['discharge-list', roundId, polId, podId, agentId],
    queryFn:  () => bookingsService.dischargeList(params).then(r => r.data.data),
    enabled:  open && ready,
    retry: false,
  });
  const rows = list || [];
  const counts = {
    discharged: rows.filter(b => b.dischargeStatus === 'Discharged').length,
    remaining:  rows.filter(b => b.dischargeStatus === 'Remaining').length,
  };

  const handleExport = async () => {
    if (!ready || exporting) return;
    setExporting(true);
    try {
      const res = await bookingsService.exportDischargeList(params);
      const disposition = res.headers?.['content-disposition'] || '';
      const match       = disposition.match(/filename="?([^";\n]+)"?/);
      downloadFile(res.data, match ? match[1].trim() : 'Discharge_List.xlsx');
      const count = res.headers?.['x-export-count'];
      toast.success(`Discharge list exported${count ? ` — ${count} container${count !== '1' ? 's' : ''}` : ''}`);
    } catch (e) {
      const msg = await exportService.readBlobError(e);
      toast.error(msg || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Discharge List (POL → POD)" size="lg">
      <div className="flex flex-col gap-5 pt-1">

        <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-700">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Lists every <strong>Final Loading</strong> container booked from the selected <strong>POL</strong> to the
            selected <strong>POD</strong>, across all voyages of the round. Export it to Excel, then upload the sheet
            with the <strong>Discharge</strong> import to record what was discharged.
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lc}>Round <span className="text-red-400">*</span></label>
            <select value={roundId} onChange={e => { setRoundId(e.target.value); setPolId(''); setPodId(''); }} className={sc}>
              <option value="">Select round…</option>
              {rounds.map(r => <option key={r._id} value={r._id}>{r.roundNumber} — {r.roundName || '(unnamed)'}</option>)}
            </select>
          </div>
          <div>
            <label className={lc}>Agent</label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} className={sc}>
              <option value="">All agents</option>
              {agents.map(a => <option key={a._id} value={a._id}>{a.agentCode ? `${a.agentCode} — ` : ''}{a.agentName}</option>)}
            </select>
          </div>
          <div>
            <label className={lc}>POL <span className="text-red-400">*</span></label>
            <select value={polId} onChange={e => setPolId(e.target.value)} disabled={!roundId} className={sc}>
              <option value="">{roundId ? 'Select POL…' : 'Select a round first'}</option>
              {ports.map(p => <option key={p.portId} value={p.portId}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={lc}>POD <span className="text-red-400">*</span></label>
            <select value={podId} onChange={e => setPodId(e.target.value)} disabled={!roundId} className={sc}>
              <option value="">{roundId ? 'Select POD…' : 'Select a round first'}</option>
              {ports.filter(p => p.portId !== polId).map(p => <option key={p.portId} value={p.portId}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
            </select>
          </div>
        </div>

        {/* The list */}
        {ready && (
          <div className="border border-gray-100 rounded-xl overflow-hidden min-w-0">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[12px]">
              <span className="font-semibold text-gray-700">{isFetching ? 'Loading…' : `${rows.length} container${rows.length !== 1 ? 's' : ''}`}</span>
              {counts.discharged > 0 && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{counts.discharged} discharged</span>}
              {counts.remaining > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{counts.remaining} remaining</span>}
            </div>
            {error ? (
              <p className="px-4 py-6 text-sm text-red-500">{error?.response?.data?.message || 'Could not load the list'}</p>
            ) : !isFetching && rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400">No Final Loading bookings go from this POL to this POD in this round.</p>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[40vh]">
                <table className="w-full border-collapse text-[12px]" style={{ minWidth: 640 }}>
                  <thead className="sticky top-0 bg-white">
                    <tr className="table-header text-[11px]">
                      {['Container', 'Type', 'Voyage', 'Agent', 'Partner', 'State'].map(h => <th key={h} className="!py-2 whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(b => (
                      <tr key={b._id} className="border-b border-gray-50">
                        <td className="px-3 py-1.5 mono font-semibold text-gray-700">{b.containerNumber}</td>
                        <td className="px-3 py-1.5 text-gray-600">{b.containerTypeId?.code} <span className="text-gray-400">{b.containerTypeId?.size}</span></td>
                        <td className="px-3 py-1.5 mono text-gray-600">{getVoyageLabel(b.voyageId)}</td>
                        <td className="px-3 py-1.5 text-gray-600">{b.agentId?.agentCode || b.agentId?.agentName}</td>
                        <td className="px-3 py-1.5 text-gray-600">{b.partnerId?.code || '—'}</td>
                        <td className="px-3 py-1.5">
                          {b.dischargeStatus
                            ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATE_STYLE[b.dischargeStatus]}`}>{b.dischargeStatus}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <button type="button" onClick={onClose} disabled={exporting} className="btn btn-secondary btn-md">Close</button>
          <button type="button" onClick={handleExport} disabled={!ready || exporting || rows.length === 0} className="btn btn-primary btn-md flex items-center gap-2">
            {exporting ? 'Exporting…' : (
              <>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export to Excel
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
